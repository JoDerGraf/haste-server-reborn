'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'data/', 'coverage/', 'config.js'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      indent: ['error', 2, { SwitchCase: 1 }],
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always']
    }
  },
  {
    files: ['static/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser }
    }
  }
];
