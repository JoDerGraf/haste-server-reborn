'use strict';

const fs = require('node:fs');
const { randomInt } = require('node:crypto');

module.exports = class DictionaryGenerator {

  constructor(options) {
    if (!options) throw new Error('No options passed to generator');
    if (!options.path) throw new Error('No dictionary path specified in options');

    const words = fs.readFileSync(options.path, 'utf8')
      .split(/[\n\r]+/)
      .map((w) => w.trim())
      // keys must be URL-safe, so drop anything that is not a plain word
      .filter((w) => /^[A-Za-z0-9]+$/.test(w));

    this.dictionary = [...new Set(words)];
    if (this.dictionary.length === 0) {
      throw new Error(`Dictionary ${options.path} contains no usable words`);
    }
  }

  // Generates a dictionary-based key, of keyLength words
  createKey(keyLength) {
    let text = '';
    for (let i = 0; i < keyLength; i++) {
      text += this.dictionary[randomInt(this.dictionary.length)];
    }
    return text;
  }

};
