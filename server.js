#!/usr/bin/env node
'use strict';

const http = require('node:http');

const { loadConfig } = require('./lib/config');
const { createLogger } = require('./lib/logger');
const { createApp } = require('./lib/app');
const { createStore, createKeyGenerator, loadStaticDocuments } = require('./lib/stores');

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logging);

  const keyGenerator = createKeyGenerator(config.keyGenerator);
  const store = await createStore(config.storage, logger);
  await loadStaticDocuments(store, config.documents, logger);

  const app = createApp({ config, store, keyGenerator, logger });
  const server = http.createServer(app);
  // Slow-loris protection
  server.requestTimeout = 300_000; // large pastes over slow links
  server.headersTimeout = 20_000;

  server.listen(config.port, config.host, () => {
    logger.info(`listening on ${config.host}:${config.port}`, { storage: config.storage.type });
  });

  const shutdown = (signal) => {
    logger.info(`received ${signal}, shutting down`);
    server.close(async () => {
      await store.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(`haste-server failed to start: ${err.message}`);
  process.exit(1);
});
