{

  "host": "0.0.0.0",
  "port": 7777,

  "keyLength": 10,

  "maxLength": 400000,

  "staticMaxAge": 86400,

  "trustProxy": false,

  "logging": {
    "level": "info",
    "format": "text"
  },

  "keyGenerator": {
    "type": "phonetic"
  },

  "rateLimits": {
    "windowMs": 60000,
    "max": 500
  },

  "storage": {
    "type": "file",
    "path": "./data",
    "expire": 2592000
  },

  "documents": {
    "about": "./about.md"
  }

}
