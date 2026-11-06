'use strict';

const path = require('node:path');
const express = require('express');
const { rateLimit } = require('express-rate-limit');

const DocumentHandler = require('./document_handler');

const STATIC_DIR = path.join(__dirname, '..', 'static');
const INDEX_FILE = path.join(STATIC_DIR, 'index.html');
const HLJS_FILE = path.join(
  path.dirname(require.resolve('@highlightjs/cdn-assets/package.json')),
  'highlight.min.js'
);

const CSP = [
  'default-src \'self\'',
  'img-src \'self\' data:',
  'object-src \'none\'',
  'base-uri \'none\'',
  'form-action \'none\'',
  'frame-ancestors \'none\''
].join('; ');

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
}

function createApp({ config, store, keyGenerator, logger }) {
  const handler = new DocumentHandler({
    store,
    keyGenerator,
    logger,
    maxLength: config.maxLength,
    keyLength: config.keyLength,
    staticKeys: Object.keys(config.documents || {})
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);

  if (config.rateLimits) {
    app.use(rateLimit({
      windowMs: config.rateLimits.windowMs,
      limit: config.rateLimits.max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Too many requests, please try again later.' }
    }));
  }

  // API
  app.get('/raw/:id', (req, res) => handler.handleRawGet(req, res));
  app.get('/documents/:id', (req, res) => handler.handleGet(req, res));
  app.post('/documents', (req, res) => handler.handlePost(req, res));

  // Static assets
  const maxAge = (config.staticMaxAge || 0) * 1000;
  app.get('/vendor/highlight.min.js', (req, res) => res.sendFile(HLJS_FILE, { maxAge }));
  app.use(express.static(STATIC_DIR, { index: false, maxAge }));

  // Everything else is a document key; the client app loads it.
  const sendIndex = (req, res) => res.sendFile(INDEX_FILE, { maxAge: 0 });
  app.get('/', sendIndex);
  app.get('/:id', sendIndex);

  app.use((req, res) => res.status(404).json({ message: 'Not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger?.error('unhandled error', { error: err.message, stack: err.stack });
    if (res.headersSent) return res.end();
    res.status(err.status && err.status < 500 ? err.status : 500)
      .json({ message: err.status && err.status < 500 ? err.message : 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };
