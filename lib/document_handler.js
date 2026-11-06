'use strict';

const busboy = require('busboy');

// Keys produced by every key generator match this, so anything else can be
// rejected before it reaches the store.
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;
const MAX_KEY_ATTEMPTS = 10;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const tooLarge = () => new HttpError(400, 'Document exceeds maximum length.');

// Read a plain request body, aborting as soon as it exceeds `limit` bytes.
function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (limit && declared > limit) return reject(tooLarge());

    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (limit && size > limit) {
        chunks.length = 0;
        return finish(reject, tooLarge());
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(resolve, Buffer.concat(chunks).toString('utf8')));
    req.on('error', (err) => finish(reject, err));
  });
}

// Read the `data` field of a multipart/form-data body (e.g. curl -F data=@file).
function readMultipart(req, limit) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        limits: { fieldSize: limit || Infinity, fields: 10, files: 0, parts: 10 }
      });
    } catch {
      return reject(new HttpError(400, 'Malformed multipart body.'));
    }

    let data = '';
    let truncated = false;
    bb.on('field', (name, value, info) => {
      if (name !== 'data') return;
      data = value;
      truncated = info.valueTruncated;
    });
    bb.on('file', (name, stream) => stream.resume());
    bb.on('close', () => (truncated ? reject(tooLarge()) : resolve(data)));
    bb.on('error', () => reject(new HttpError(400, 'Malformed multipart body.')));
    req.pipe(bb);
  });
}

class DocumentHandler {

  constructor(options = {}) {
    this.keyLength = options.keyLength || DocumentHandler.defaultKeyLength;
    this.maxLength = options.maxLength || 0;
    this.store = options.store;
    this.keyGenerator = options.keyGenerator;
    this.logger = options.logger;
    this.staticKeys = new Set(options.staticKeys || []);
  }

  // "abcdef.js" -> "abcdef"; returns null for anything that is not a valid key
  static parseKey(id) {
    const key = String(id || '').split('.')[0];
    return KEY_PATTERN.test(key) ? key : null;
  }

  async fetch(id) {
    const key = DocumentHandler.parseKey(id);
    if (!key) return { key: null, data: null };
    const data = await this.store.get(key, this.staticKeys.has(key));
    return { key, data };
  }

  notFound(res) {
    res.status(404).json({ message: 'Document not found.' });
  }

  async handleGet(req, res) {
    const { key, data } = await this.fetch(req.params.id);
    if (data === null || data === undefined) return this.notFound(res);
    this.logger?.verbose('retrieved document', { key });
    res.json({ data, key });
  }

  async handleRawGet(req, res) {
    const { key, data } = await this.fetch(req.params.id);
    if (data === null || data === undefined) return this.notFound(res);
    this.logger?.verbose('retrieved raw document', { key });
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      // never let a browser render a paste as anything but text
      'Content-Security-Policy': 'default-src \'none\'; sandbox',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(data);
  }

  async handlePost(req, res) {
    let data;
    try {
      // maxLength counts characters (JS string length), exactly like the
      // original haste-server. While streaming we can only count bytes; one
      // UTF-16 code unit is at most 3 UTF-8 bytes, so cap there and do the
      // exact character check after decoding.
      const byteLimit = this.maxLength ? this.maxLength * 3 : 0;
      const ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      data = ct === 'multipart/form-data'
        ? await readMultipart(req, byteLimit)
        : await readRawBody(req, byteLimit);
      if (this.maxLength && data.length > this.maxLength) throw tooLarge();
    } catch (err) {
      if (err instanceof HttpError) {
        this.logger?.warn('rejected document', { reason: err.message });
        // stop receiving the rest of an oversized upload
        res.set('Connection', 'close');
        return res.status(err.status).json({ message: err.message });
      }
      throw err;
    }

    if (!data) {
      return res.status(400).json({ message: 'Document is empty.' });
    }

    const key = await this.chooseKey();
    if (!key || !(await this.store.set(key, data))) {
      this.logger?.error('error adding document');
      return res.status(500).json({ message: 'Error adding document.' });
    }
    this.logger?.verbose('added document', { key });
    res.json({ key });
  }

  // Keep choosing keys until one isn't taken
  async chooseKey() {
    for (let i = 0; i < MAX_KEY_ATTEMPTS; i++) {
      const key = this.acceptableKey();
      if (this.staticKeys.has(key)) continue;
      const existing = await this.store.get(key, true);
      if (existing === null || existing === undefined) return key;
    }
    return null;
  }

  acceptableKey() {
    return this.keyGenerator.createKey(this.keyLength);
  }

}

DocumentHandler.defaultKeyLength = 10;
DocumentHandler.HttpError = HttpError;

module.exports = DocumentHandler;
