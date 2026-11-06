'use strict';

const { createClient } = require('redis');

// options.url      - redis:// URL (also read from REDIS_URL / REDISTOGO_URL)
// options.host     - host (default 127.0.0.1)
// options.port     - port (default 6379)
// options.db       - database index (default 0)
// options.username - ACL username (optional)
// options.password - password (optional)
// options.expire   - TTL in seconds, pushed forward on every view (optional)

class RedisDocumentStore {

  constructor(options = {}, logger, client) {
    this.expire = options.expire;
    this.logger = logger;
    this.options = options;
    this.client = client || null;
  }

  async init() {
    if (this.client) return;

    const url = this.options.url || process.env.REDIS_URL || process.env.REDISTOGO_URL;
    const clientOptions = url
      ? { url }
      : {
        socket: {
          host: this.options.host || '127.0.0.1',
          port: this.options.port || 6379
        },
        username: this.options.username || undefined,
        password: this.options.password || undefined
      };
    if (this.options.db !== undefined && !(url && /\/\d+$/.test(url))) {
      clientOptions.database = this.options.db;
    }

    this.client = createClient(clientOptions);
    this.client.on('error', (err) => {
      this.logger?.error('redis error', { error: err.message });
    });
    await this.client.connect();
    this.logger?.info('connected to redis', { database: clientOptions.database ?? 0 });
  }

  async setExpiration(key) {
    if (!this.expire) return;
    try {
      await this.client.expire(key, this.expire);
    } catch (err) {
      this.logger?.error('failed to set expiry on key', { error: err.message });
    }
  }

  async set(key, data, skipExpire) {
    try {
      await this.client.set(key, data);
      if (!skipExpire) await this.setExpiration(key);
      return true;
    } catch (err) {
      this.logger?.error('error writing document to redis', { error: err.message });
      return false;
    }
  }

  async get(key, skipExpire) {
    try {
      const value = await this.client.get(key);
      if (value !== null && !skipExpire) await this.setExpiration(key);
      return value;
    } catch (err) {
      this.logger?.error('error reading document from redis', { error: err.message });
      return null;
    }
  }

  async close() {
    if (this.client && this.client.isOpen) await this.client.close();
  }

}

module.exports = RedisDocumentStore;
