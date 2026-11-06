'use strict';

const fs = require('node:fs/promises');

const STORES = {
  file: () => require('./document_stores/file'),
  redis: () => require('./document_stores/redis'),
  postgres: () => require('./document_stores/postgres'),
  memcached: () => require('./document_stores/memcached')
};

const KEY_GENERATORS = {
  phonetic: () => require('./key_generators/phonetic'),
  random: () => require('./key_generators/random'),
  dictionary: () => require('./key_generators/dictionary')
};

function pick(registry, type, what) {
  const loader = registry[type];
  if (!loader) {
    throw new Error(`Unknown ${what} "${type}". Valid options: ${Object.keys(registry).join(', ')}`);
  }
  return loader();
}

async function createStore(storageConfig, logger) {
  const Store = pick(STORES, storageConfig.type || 'file', 'storage type');
  const store = new Store(storageConfig, logger);
  await store.init();
  return store;
}

function createKeyGenerator(options = {}) {
  const Gen = pick(KEY_GENERATORS, options.type || 'phonetic', 'key generator');
  return new Gen(options);
}

// Static documents (e.g. "about") are loaded into the store on boot and
// never expire.
async function loadStaticDocuments(store, documents, logger) {
  for (const [name, file] of Object.entries(documents || {})) {
    let data;
    try {
      data = await fs.readFile(file, 'utf8');
    } catch (err) {
      logger?.warn('failed to load static document', { name, file, error: err.message });
      continue;
    }
    if (await store.set(name, data, true)) {
      logger?.verbose('loaded static document', { name, file });
    } else {
      logger?.warn('failed to store static document', { name });
    }
  }
}

module.exports = { createStore, createKeyGenerator, loadStaticDocuments };
