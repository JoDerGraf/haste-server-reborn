'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Stores each document in its own file named md5(key).
// The naming scheme is unchanged from the original haste-server so existing
// data directories keep working.
//
// options.path   - directory to store documents in (default ./data)
// options.expire - not supported, documents are kept forever

class FileDocumentStore {

  constructor(options = {}, logger) {
    this.basePath = path.resolve(options.path || './data');
    this.expire = options.expire;
    this.logger = logger;
  }

  static md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
  }

  async init() {
    await fs.mkdir(this.basePath, { recursive: true, mode: 0o700 });
    try {
      await fs.access(this.basePath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      throw new Error(
        `Data directory ${this.basePath} is not readable/writable by uid ${process.getuid ? process.getuid() : '?'}. ` +
        'If you migrated from an image that ran as root, run: chown -R 1000:1000 <data dir>'
      );
    }
    if (this.expire && this.logger) {
      this.logger.info('file store does not support expiration, documents are kept until deleted');
    }
  }

  filename(key) {
    return path.join(this.basePath, FileDocumentStore.md5(key));
  }

  async set(key, data) {
    try {
      await fs.writeFile(this.filename(key), data, { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch (err) {
      this.logger?.error('error writing document', { error: err.message });
      return false;
    }
  }

  async get(key) {
    try {
      return await fs.readFile(this.filename(key), 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger?.error('error reading document', { error: err.message });
      }
      return null;
    }
  }

  async close() {}

}

module.exports = FileDocumentStore;
