'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig } = require('../lib/config');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'haste-config-'));

describe('loadConfig', () => {
  it('uses defaults when no config file exists', () => {
    const cwd = tmpDir();
    const config = loadConfig({ env: {}, cwd });
    assert.equal(config.port, 7777);
    assert.equal(config.storage.type, 'file');
    assert.equal(config.storage.path, path.join(cwd, 'data'));
    assert.deepEqual(config.rateLimits, { windowMs: 60000, max: 500 });
  });

  it('accepts the rlister/hastebin environment variables', () => {
    const config = loadConfig({
      cwd: tmpDir(),
      env: {
        PORT: '8080',
        KEY_LENGTH: '6',
        KEY_GENERATOR_TYPE: 'random',
        STORAGE_TYPE: 'redis',
        STORAGE_HOST: 'redis',
        STORAGE_PORT: '6380',
        STORAGE_DB: '3',
        STORAGE_EXPIRE: '60',
        RECOMPRESS_STATIC_ASSETS: 'true', // ignored, no longer needed
        RATE_LIMIT_MAX: '0'
      }
    });
    assert.equal(config.port, 8080);
    assert.equal(config.keyLength, 6);
    assert.equal(config.keyGenerator.type, 'random');
    assert.equal(config.storage.type, 'redis');
    assert.equal(config.storage.host, 'redis');
    assert.equal(config.storage.port, 6380);
    assert.equal(config.storage.db, 3);
    assert.equal(config.storage.expire, 60);
    assert.equal(config.rateLimits, null);
  });

  it('understands legacy config file formats', () => {
    const cwd = tmpDir();
    fs.writeFileSync(path.join(cwd, 'config.js'), JSON.stringify({
      logging: [{ level: 'verbose', type: 'Console', colorize: true }],
      rateLimits: { categories: { normal: { totalRequests: 10, every: 1000 } } }
    }));
    const config = loadConfig({ env: {}, cwd });
    assert.equal(config.logging.level, 'verbose');
    assert.deepEqual(config.rateLimits, { windowMs: 1000, max: 10 });
  });

  it('rejects invalid numbers', () => {
    assert.throws(() => loadConfig({ cwd: tmpDir(), env: { PORT: 'abc' } }), /PORT/);
  });
});
