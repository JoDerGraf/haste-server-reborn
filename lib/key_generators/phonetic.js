'use strict';

// Draws inspiration from pwgen and http://tools.arantius.com/password

const { randomInt } = require('node:crypto');

const VOWELS = 'aeiou';
const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';

const pick = (chars) => chars[randomInt(chars.length)];

module.exports = class PhoneticKeyGenerator {

  // Generate a phonetic key of alternating consonant & vowel
  createKey(keyLength) {
    let text = '';
    const start = randomInt(2);
    for (let i = 0; i < keyLength; i++) {
      text += (i % 2 === start) ? pick(CONSONANTS) : pick(VOWELS);
    }
    return text;
  }

};
