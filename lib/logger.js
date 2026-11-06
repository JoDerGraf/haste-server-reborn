'use strict';

const winston = require('winston');

function createLogger({ level = 'info', format = 'text', silent = false } = {}) {
  const fmt = format === 'json'
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level: lvl, message, ...meta }) => {
        const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} ${lvl}: ${message}${extra}`;
      })
    );

  return winston.createLogger({
    level,
    silent,
    format: fmt,
    transports: [new winston.transports.Console()]
  });
}

module.exports = { createLogger };
