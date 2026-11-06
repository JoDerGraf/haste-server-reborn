'use strict';

// Runs only when REDIS_URL is set, e.g. REDIS_URL=redis://localhost:6379/15 npm test

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const RedisDocumentStore = require('../lib/document_stores/redis');

describe('RedisDocumentStore', { skip: !process.env.REDIS_URL && 'REDIS_URL not set' }, () => {
  let store;

  before(async () => {
    store = new RedisDocumentStore({ url: process.env.REDIS_URL, expire: 10 });
    await store.init();
  });

  after(() => store.close());

  it('sets a key with an expiration', async () => {
    assert.equal(await store.set('hello1', 'world'), true);
    assert.ok((await store.client.ttl('hello1')) > 1);
    assert.equal(await store.get('hello1'), 'world');
  });

  it('does not set an expiration when told not to', async () => {
    await store.set('hello2', 'world', true);
    assert.equal(await store.client.ttl('hello2'), -1);
  });

  it('returns null for missing keys', async () => {
    assert.equal(await store.get('does-not-exist'), null);
  });
});
