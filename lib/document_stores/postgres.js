'use strict';

const { Pool } = require('pg');

// options.url / options.connectionUrl - postgres:// URL (also DATABASE_URL)
// options.expire - TTL in seconds, pushed forward on every view (optional)
//
// The table is created automatically if it does not exist. The schema is
// unchanged from the original haste-server.

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS entries (
  id serial PRIMARY KEY,
  key varchar(255) NOT NULL,
  value text NOT NULL,
  expiration int,
  UNIQUE(key)
)`;

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const now = () => Math.floor(Date.now() / 1000);

class PostgresDocumentStore {

  constructor(options = {}, logger) {
    this.expire = options.expire;
    this.logger = logger;
    this.connectionString = process.env.DATABASE_URL || options.url || options.connectionUrl;
    this.pool = null;
    this.cleanupTimer = null;
  }

  async init() {
    this.pool = new Pool({ connectionString: this.connectionString });
    this.pool.on('error', (err) => {
      this.logger?.error('postgres pool error', { error: err.message });
    });
    await this.pool.query(CREATE_TABLE);
    this.logger?.info('connected to postgres');

    if (this.expire) {
      this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
      this.cleanupTimer.unref();
    }
  }

  // Expired rows are already invisible to get(); this just frees the space.
  async cleanup() {
    try {
      const res = await this.pool.query(
        'DELETE FROM entries WHERE expiration IS NOT NULL AND expiration <= $1', [now()]
      );
      if (res.rowCount) this.logger?.info('removed expired documents', { count: res.rowCount });
    } catch (err) {
      this.logger?.error('error cleaning up expired documents', { error: err.message });
    }
  }

  async set(key, data, skipExpire) {
    const expiration = this.expire && !skipExpire ? now() + this.expire : null;
    try {
      await this.pool.query(
        `INSERT INTO entries (key, value, expiration) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expiration = EXCLUDED.expiration`,
        [key, data, expiration]
      );
      return true;
    } catch (err) {
      this.logger?.error('error persisting value to postgres', { error: err.message });
      return false;
    }
  }

  async get(key, skipExpire) {
    try {
      const ts = now();
      const res = await this.pool.query(
        'SELECT id, value FROM entries WHERE key = $1 AND (expiration IS NULL OR expiration > $2)',
        [key, ts]
      );
      if (!res.rows.length) return null;
      if (this.expire && !skipExpire) {
        await this.pool.query(
          'UPDATE entries SET expiration = $1 WHERE id = $2 AND expiration IS NOT NULL',
          [ts + this.expire, res.rows[0].id]
        );
      }
      return res.rows[0].value;
    } catch (err) {
      this.logger?.error('error retrieving value from postgres', { error: err.message });
      return null;
    }
  }

  async close() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.pool) await this.pool.end();
  }

}

module.exports = PostgresDocumentStore;
