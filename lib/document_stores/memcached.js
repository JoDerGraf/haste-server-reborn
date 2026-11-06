'use strict';

const memjs = require('memjs');

// options.host     - host (default 127.0.0.1)
// options.port     - port (default 11211)
// options.username / options.password - SASL credentials (optional)
// options.expire   - TTL in seconds (optional, not pushed forward on views)

class MemcachedDocumentStore {

  constructor(options = {}, logger) {
    this.expire = options.expire;
    this.logger = logger;
    this.options = options;
    this.client = null;
  }

  async init() {
    const host = this.options.host || '127.0.0.1';
    const port = this.options.port || 11211;
    this.client = memjs.Client.create(`${host}:${port}`, {
      username: this.options.username,
      password: this.options.password,
      logger: { log: (...args) => this.logger?.warn(args.join(' ')) }
    });
    this.logger?.info('using memcached', { host, port });
  }

  async set(key, data, skipExpire) {
    try {
      await this.client.set(key, data, { expires: skipExpire ? 0 : (this.expire || 0) });
      return true;
    } catch (err) {
      this.logger?.error('error writing document to memcached', { error: err.message });
      return false;
    }
  }

  async get(key) {
    try {
      const { value } = await this.client.get(key);
      return value === null ? null : value.toString('utf8');
    } catch (err) {
      this.logger?.error('error reading document from memcached', { error: err.message });
      return null;
    }
  }

  async close() {
    if (this.client) this.client.close();
  }

}

module.exports = MemcachedDocumentStore;
