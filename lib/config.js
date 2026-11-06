'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Defaults mirror the classic haste / rlister/hastebin behaviour so this
// works as a drop-in replacement.
const DEFAULTS = {
  host: '0.0.0.0',
  port: 7777,
  keyLength: 10,
  maxLength: 400000, // bytes, 0 = unlimited (not recommended)
  staticMaxAge: 86400, // seconds
  trustProxy: false,
  logging: { level: 'info', format: 'text' },
  keyGenerator: { type: 'phonetic' },
  rateLimits: { windowMs: 60000, max: 500 },
  storage: { type: 'file', path: './data', db: 2, expire: 2592000 },
  documents: { about: './about.md' }
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

function toInt(name, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid value for ${name}: expected a non-negative integer, got "${value}"`);
  }
  return n;
}

function parseTrustProxy(value) {
  if (value === 'true') return true;
  if (value === 'false' || value === '') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. "loopback", "10.0.0.0/8"
}

// Older config files used connect-ratelimit's format:
//   { categories: { normal: { totalRequests, every } } }
function normalizeRateLimits(rl) {
  if (!rl) return null;
  if (rl.categories && rl.categories.normal) {
    return { windowMs: rl.categories.normal.every, max: rl.categories.normal.totalRequests };
  }
  return rl;
}

// Older config files used an array of winston 0.x transport options.
function normalizeLogging(logging) {
  if (Array.isArray(logging)) {
    const first = logging[0] || {};
    return { level: first.level || DEFAULTS.logging.level, format: 'text' };
  }
  return logging;
}

function readConfigFile(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Could not parse config file ${file} as JSON: ${err.message}`);
  }
}

// Environment variables use the same names as the rlister/hastebin image.
function applyEnv(config, env) {
  const c = merge(config, {});
  c.storage = { ...c.storage };
  c.keyGenerator = { ...c.keyGenerator };
  c.logging = { ...c.logging };
  c.rateLimits = c.rateLimits ? { ...c.rateLimits } : null;

  const set = (name, fn) => {
    if (env[name] !== undefined && env[name] !== '') fn(env[name]);
  };

  set('HOST', (v) => { c.host = v; });
  set('PORT', (v) => { c.port = toInt('PORT', v); });
  set('KEY_LENGTH', (v) => { c.keyLength = toInt('KEY_LENGTH', v); });
  set('MAX_LENGTH', (v) => { c.maxLength = toInt('MAX_LENGTH', v); });
  set('STATIC_MAX_AGE', (v) => { c.staticMaxAge = toInt('STATIC_MAX_AGE', v); });
  set('TRUST_PROXY', (v) => { c.trustProxy = parseTrustProxy(v); });

  set('LOGGING_LEVEL', (v) => { c.logging.level = v; });
  set('LOGGING_FORMAT', (v) => { c.logging.format = v; });

  set('KEY_GENERATOR_TYPE', (v) => { c.keyGenerator.type = v; });
  set('KEY_GENERATOR_KEYSPACE', (v) => { c.keyGenerator.keyspace = v; });
  set('KEY_GENERATOR_PATH', (v) => { c.keyGenerator.path = v; });

  set('STORAGE_TYPE', (v) => { c.storage.type = v; });
  set('STORAGE_PATH', (v) => { c.storage.path = v; });
  set('STORAGE_HOST', (v) => { c.storage.host = v; });
  set('STORAGE_PORT', (v) => { c.storage.port = toInt('STORAGE_PORT', v); });
  set('STORAGE_DB', (v) => { c.storage.db = toInt('STORAGE_DB', v); });
  set('STORAGE_USERNAME', (v) => { c.storage.username = v; });
  set('STORAGE_PASSWORD', (v) => { c.storage.password = v; });
  set('STORAGE_EXPIRE', (v) => { c.storage.expire = toInt('STORAGE_EXPIRE', v); });
  set('STORAGE_URL', (v) => { c.storage.url = v; });

  set('RATE_LIMIT_MAX', (v) => {
    const max = toInt('RATE_LIMIT_MAX', v);
    c.rateLimits = max === 0 ? null : { ...(c.rateLimits || DEFAULTS.rateLimits), max };
  });
  set('RATE_LIMIT_WINDOW_MS', (v) => {
    if (c.rateLimits) c.rateLimits.windowMs = toInt('RATE_LIMIT_WINDOW_MS', v);
  });

  // DOCUMENTS="about=./about.md,rules=./rules.md"
  set('DOCUMENTS', (v) => {
    c.documents = {};
    for (const pair of v.split(',')) {
      const [name, file] = pair.split('=').map((s) => s && s.trim());
      if (name && file) c.documents[name] = file;
    }
  });

  return c;
}

function loadConfig({ env = process.env, cwd = process.cwd() } = {}) {
  const file = path.resolve(cwd, env.CONFIG_FILE || 'config.js');
  const fromFile = readConfigFile(file);

  let config = merge(DEFAULTS, fromFile);
  config.logging = normalizeLogging(config.logging);
  config.rateLimits = normalizeRateLimits(
    'rateLimits' in fromFile ? fromFile.rateLimits : DEFAULTS.rateLimits
  );
  config = applyEnv(config, env);

  // Resolve relative paths against the working directory once.
  config.storage.path = path.resolve(cwd, config.storage.path || './data');
  if (config.keyGenerator.path) {
    config.keyGenerator.path = path.resolve(cwd, config.keyGenerator.path);
  }
  const docs = {};
  for (const [name, p] of Object.entries(config.documents || {})) {
    docs[name] = path.resolve(cwd, p);
  }
  config.documents = docs;

  return config;
}

module.exports = { loadConfig, DEFAULTS };
