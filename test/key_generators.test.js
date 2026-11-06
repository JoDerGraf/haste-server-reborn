'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RandomGenerator = require('../lib/key_generators/random');
const PhoneticGenerator = require('../lib/key_generators/phonetic');
const DictionaryGenerator = require('../lib/key_generators/dictionary');

describe('RandomKeyGenerator', () => {
  it('returns a key of the proper length', () => {
    assert.equal(new RandomGenerator().createKey(6).length, 6);
  });

  it('uses the given keyspace', () => {
    assert.equal(new RandomGenerator({ keyspace: 'A' }).createKey(6), 'AAAAAA');
  });

  it('rejects keyspaces with URL-unsafe characters', () => {
    assert.throws(() => new RandomGenerator({ keyspace: 'ab/c' }));
  });
});

describe('PhoneticKeyGenerator', () => {
  const vowels = 'aeiou';
  const consonants = 'bcdfghjklmnpqrstvwxyz';

  it('returns a key of the proper length', () => {
    assert.equal(new PhoneticGenerator().createKey(6).length, 6);
  });

  it('alternates consonants and vowels', () => {
    const gen = new PhoneticGenerator();
    for (let n = 0; n < 50; n++) {
      const key = gen.createKey(4);
      const startsWithConsonant = consonants.includes(key[0]);
      for (let i = 0; i < key.length; i++) {
        const expectConsonant = (i % 2 === 0) === startsWithConsonant;
        assert.ok((expectConsonant ? consonants : vowels).includes(key[i]), key);
      }
    }
  });
});

describe('DictionaryGenerator', () => {
  it('throws if given no options', () => {
    assert.throws(() => new DictionaryGenerator());
  });

  it('throws if given no path', () => {
    assert.throws(() => new DictionaryGenerator({}));
  });

  it('builds keys from dictionary words, skipping unsafe ones', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'haste-')), 'dict');
    fs.writeFileSync(file, 'cat\n../etc\ndog\'s\n');
    const gen = new DictionaryGenerator({ path: file });
    assert.equal(gen.createKey(3), 'catcatcat');
  });
});
