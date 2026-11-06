'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createApp } = require('../lib/app');
const { createLogger } = require('../lib/logger');
const { createStore, createKeyGenerator, loadStaticDocuments } = require('../lib/stores');
const FileDocumentStore = require('../lib/document_stores/file');

describe('HTTP API (file store)', () => {
  let server, base, dataDir;

  before(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haste-test-'));
    dataDir = path.join(root, 'data');
    const aboutFile = path.join(root, 'about.md');
    fs.writeFileSync(aboutFile, '# About');

    const config = {
      maxLength: 1000,
      keyLength: 8,
      staticMaxAge: 0,
      trustProxy: false,
      rateLimits: null,
      documents: { about: aboutFile }
    };
    const logger = createLogger({ silent: true });
    const store = await createStore({ type: 'file', path: dataDir }, logger);
    await loadStaticDocuments(store, config.documents, logger);
    const app = createApp({ config, store, keyGenerator: createKeyGenerator({ type: 'random' }), logger });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('stores and retrieves a document', async () => {
    const post = await fetch(`${base}/documents`, { method: 'POST', body: 'hello world' });
    assert.equal(post.status, 200);
    const { key } = await post.json();
    assert.match(key, /^[A-Za-z0-9]{8}$/);

    const get = await fetch(`${base}/documents/${key}`);
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), { data: 'hello world', key });

    const getExt = await fetch(`${base}/documents/${key}.js`);
    assert.equal((await getExt.json()).data, 'hello world');
  });

  it('keeps the original on-disk format (md5 of key)', async () => {
    const post = await fetch(`${base}/documents`, { method: 'POST', body: 'on disk' });
    const { key } = await post.json();
    const file = path.join(dataDir, FileDocumentStore.md5(key));
    assert.equal(fs.readFileSync(file, 'utf8'), 'on disk');
  });

  it('accepts multipart uploads', async () => {
    const form = new FormData();
    form.append('data', 'from a form');
    const post = await fetch(`${base}/documents`, { method: 'POST', body: form });
    assert.equal(post.status, 200);
    const { key } = await post.json();
    const raw = await fetch(`${base}/raw/${key}`);
    assert.equal(await raw.text(), 'from a form');
  });

  it('serves raw documents as sandboxed plain text', async () => {
    const post = await fetch(`${base}/documents`, { method: 'POST', body: '<script>alert(1)</script>' });
    const { key } = await post.json();
    const raw = await fetch(`${base}/raw/${key}`);
    assert.equal(raw.status, 200);
    assert.equal(raw.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(raw.headers.get('x-content-type-options'), 'nosniff');
    assert.match(raw.headers.get('content-security-policy'), /sandbox/);
    assert.equal(await raw.text(), '<script>alert(1)</script>');
  });

  it('rejects documents over maxLength', async () => {
    const post = await fetch(`${base}/documents`, { method: 'POST', body: 'x'.repeat(1001) });
    assert.equal(post.status, 400);
    assert.equal((await post.json()).message, 'Document exceeds maximum length.');
  });

  it('counts maxLength in characters like 1.x, not bytes', async () => {
    const atLimit = 'ä'.repeat(1000); // 1000 chars, 2000 bytes
    const post = await fetch(`${base}/documents`, { method: 'POST', body: atLimit });
    assert.equal(post.status, 200);
    const { key } = await post.json();
    assert.equal(await (await fetch(`${base}/raw/${key}`)).text(), atLimit);

    const over = await fetch(`${base}/documents`, { method: 'POST', body: 'ä'.repeat(1001) });
    assert.equal(over.status, 400);
  });

  it('does not corrupt multi-byte characters split across chunks', async () => {
    const body = 'ä€🎉'.repeat(250); // 1000 UTF-16 units, sent in tiny chunks
    const bytes = Buffer.from(body);
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.subarray(i, i + 7));
        controller.close();
      }
    });
    const post = await fetch(`${base}/documents`, { method: 'POST', body: stream, duplex: 'half' });
    assert.equal(post.status, 200);
    const { key } = await post.json();
    assert.equal(await (await fetch(`${base}/raw/${key}`)).text(), body);
  });

  it('rejects oversized multipart fields', async () => {
    const form = new FormData();
    form.append('data', 'x'.repeat(1001));
    const post = await fetch(`${base}/documents`, { method: 'POST', body: form });
    assert.equal(post.status, 400);
  });

  it('rejects empty documents', async () => {
    const post = await fetch(`${base}/documents`, { method: 'POST', body: '' });
    assert.equal(post.status, 400);
  });

  it('returns 404 for unknown and invalid keys', async () => {
    assert.equal((await fetch(`${base}/documents/doesnotexist`)).status, 404);
    assert.equal((await fetch(`${base}/raw/doesnotexist`)).status, 404);
    assert.equal((await fetch(`${base}/documents/..%2F..%2Fetc%2Fpasswd`)).status, 404);
    assert.equal((await fetch(`${base}/documents/a%00b`)).status, 404);
  });

  it('serves static documents', async () => {
    const res = await fetch(`${base}/documents/about`);
    assert.deepEqual(await res.json(), { data: '# About', key: 'about' });
  });

  it('serves the app shell with security headers for any key', async () => {
    for (const p of ['/', '/somekey', '/about.md']) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 200, p);
      assert.match(await res.text(), /<title>hastebin<\/title>/);
      assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('x-powered-by'), null);
    }
  });

  it('serves bundled assets', async () => {
    for (const p of ['/application.js', '/application.css', '/vendor/highlight.min.js', '/logo.png']) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 200, p);
    }
  });

  it('does not serve files outside the static directory', async () => {
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/static/../server.js']) {
      const res = await fetch(`${base}${p}`);
      const body = await res.text();
      assert.doesNotMatch(body, /"dependencies"|createServer/, p);
    }
  });
});

describe('rate limiting', () => {
  it('limits requests per window', async () => {
    const logger = createLogger({ silent: true });
    const store = { get: async () => null, set: async () => true };
    const app = createApp({
      config: { maxLength: 100, rateLimits: { windowMs: 60000, max: 2 }, documents: {} },
      store,
      keyGenerator: createKeyGenerator(),
      logger
    });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      assert.equal((await fetch(`${base}/documents/x`)).status, 404);
      assert.equal((await fetch(`${base}/documents/x`)).status, 404);
      assert.equal((await fetch(`${base}/documents/x`)).status, 429);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
