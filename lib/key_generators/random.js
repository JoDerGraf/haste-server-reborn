'use strict';

const { randomInt } = require('node:crypto');

const DEFAULT_KEYSPACE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

module.exports = class RandomKeyGenerator {

  constructor(options = {}) {
    this.keyspace = options.keyspace || DEFAULT_KEYSPACE;
    if (!/^[A-Za-z0-9_-]+$/.test(this.keyspace)) {
      throw new Error('keyspace may only contain the characters A-Z a-z 0-9 _ -');
    }
  }

  createKey(keyLength) {
    let text = '';
    for (let i = 0; i < keyLength; i++) {
      text += this.keyspace[randomInt(this.keyspace.length)];
    }
    return text;
  }

};
