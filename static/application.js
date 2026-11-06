/* global hljs */
(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const htmlEscape = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // highlight.js output is HTML-escaped; plain text is escaped by us.
  function highlight(data, lang) {
    if (lang === 'txt' || lang === 'plaintext') {
      return { value: htmlEscape(data), language: lang };
    }
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(data, { language: lang, ignoreIllegals: true });
    }
    return hljs.highlightAuto(data);
  }

  ///// represents a single document

  class HasteDocument {
    constructor() {
      this.locked = false;
    }

    // Get this document from the server and lock it here
    async load(key, lang) {
      let body;
      try {
        const res = await fetch('/documents/' + encodeURIComponent(key), {
          headers: { Accept: 'application/json' }
        });
        if (!res.ok) return null;
        body = await res.json();
      } catch {
        return null;
      }
      this.locked = true;
      this.key = key;
      this.data = body.data;
      const high = highlight(body.data, lang);
      return {
        value: high.value,
        key: key,
        language: high.language || lang,
        lineCount: body.data.split('\n').length
      };
    }

    // Save this document to the server and lock it here
    async save(data) {
      if (this.locked) return null;
      this.data = data;
      let res, body;
      try {
        res = await fetch('/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8', Accept: 'application/json' },
          body: data
        });
        body = await res.json();
      } catch {
        throw new Error('Something went wrong!');
      }
      if (!res.ok) throw new Error(body.message || 'Something went wrong!');

      this.locked = true;
      this.key = body.key;
      const high = hljs.highlightAuto(data);
      return {
        value: high.value,
        key: body.key,
        language: high.language,
        lineCount: data.split('\n').length
      };
    }
  }

  ///// represents the paste application

  // Map of common extensions
  // Note: this list does not need to include anything that IS its extension,
  // due to the behavior of lookupTypeByExtension and lookupExtensionByType
  const extensionMap = {
    rb: 'ruby', py: 'python', pl: 'perl', php: 'php', scala: 'scala', go: 'go',
    xml: 'xml', html: 'xml', htm: 'xml', css: 'css', js: 'javascript', vbs: 'vbscript',
    lua: 'lua', pas: 'delphi', java: 'java', cpp: 'cpp', cc: 'cpp', m: 'objectivec',
    vala: 'vala', sql: 'sql', sm: 'smalltalk', lisp: 'lisp', ini: 'ini',
    diff: 'diff', bash: 'bash', sh: 'bash', tex: 'tex', erl: 'erlang', hs: 'haskell',
    md: 'markdown', txt: '', coffee: 'coffee', json: 'json', swift: 'swift',
    ts: 'typescript', rs: 'rust', kt: 'kotlin', cs: 'csharp', yml: 'yaml',
    yaml: 'yaml', c: 'c', h: 'c', r: 'r', scss: 'scss', less: 'less',
    graphql: 'graphql', mk: 'makefile', wasm: 'wasm', vb: 'vbnet'
  };

  class Haste {
    constructor(appName, options) {
      this.appName = appName;
      this.options = options;
      this.textarea = $('textarea');
      this.box = $('#box');
      this.code = $('#box code');
      this.linenos = $('#linenos');
      this.doc = new HasteDocument();
      this.configureButtons();
      this.configureShortcuts();
      this.configureTabKey();
      if (!options.twitter) $('#box2 .twitter').hidden = true;
    }

    // Set the page title - include the appName
    setTitle(ext) {
      document.title = ext ? this.appName + ' - ' + ext : this.appName;
    }

    // Show a message box
    showMessage(msg, cls) {
      const li = document.createElement('li');
      li.className = cls || 'info';
      li.textContent = msg;
      $('#messages').prepend(li);
      setTimeout(() => li.remove(), 3000);
    }

    lightKey() {
      this.configureKey(['new', 'save']);
    }

    fullKey() {
      this.configureKey(['new', 'duplicate', 'twitter', 'raw']);
    }

    // Set the key up for certain things to be enabled
    configureKey(enable) {
      for (const el of $$('#box2 .function')) {
        el.classList.toggle('enabled', enable.some((cls) => el.classList.contains(cls)));
      }
    }

    showEditor(value) {
      this.box.hidden = true;
      this.textarea.value = value || '';
      this.textarea.hidden = false;
      this.textarea.focus();
    }

    showDocument(ret) {
      this.code.innerHTML = ret.value;
      this.setTitle(ret.key);
      this.fullKey();
      this.textarea.value = '';
      this.textarea.hidden = true;
      this.box.hidden = false;
      this.box.focus();
      this.addLineNumbers(ret.lineCount);
    }

    // Remove the current document (if there is one) and set up for a new one
    newDocument(hideHistory) {
      this.doc = new HasteDocument();
      if (!hideHistory) window.history.pushState(null, this.appName, '/');
      this.setTitle();
      this.lightKey();
      this.showEditor('');
      this.removeLineNumbers();
    }

    // Look up the extension preferred for a type
    // If not found, return the type itself - which we'll place as the extension
    lookupExtensionByType(type) {
      for (const key in extensionMap) {
        if (extensionMap[key] === type) return key;
      }
      return type;
    }

    // Look up the type for a given extension
    // If not found, return the extension - which we'll attempt to use as the type
    lookupTypeByExtension(ext) {
      return extensionMap[ext] || ext;
    }

    addLineNumbers(lineCount) {
      const lines = [];
      for (let i = 1; i <= lineCount; i++) lines.push(i);
      this.linenos.textContent = lines.join('\n');
    }

    removeLineNumbers() {
      this.linenos.textContent = '>';
    }

    // Load a document and show it
    async loadDocument(key) {
      const parts = key.split('.', 2);
      this.doc = new HasteDocument();
      const ret = await this.doc.load(parts[0], this.lookupTypeByExtension(parts[1]));
      if (ret) {
        this.showDocument(ret);
      } else {
        this.newDocument();
      }
    }

    // Duplicate the current document - only if locked
    duplicateDocument() {
      if (!this.doc.locked) return;
      const currentData = this.doc.data;
      this.newDocument();
      this.textarea.value = currentData;
    }

    // Lock the current document
    async lockDocument() {
      let ret;
      try {
        ret = await this.doc.save(this.textarea.value);
      } catch (err) {
        this.showMessage(err.message, 'error');
        return;
      }
      if (!ret) return;
      let file = '/' + ret.key;
      if (ret.language) file += '.' + this.lookupExtensionByType(ret.language);
      window.history.pushState(null, this.appName + '-' + ret.key, file);
      this.showDocument(ret);
    }

    configureButtons() {
      this.buttons = [
        {
          el: $('#box2 .save'),
          label: 'Save',
          shortcutDescription: 'control + s',
          shortcut: (evt) => (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 's',
          action: () => {
            if (this.textarea.value.trim() !== '') this.lockDocument();
          }
        },
        {
          el: $('#box2 .new'),
          label: 'New',
          shortcutDescription: 'control + n',
          shortcut: (evt) => evt.ctrlKey && evt.key.toLowerCase() === 'n',
          action: () => this.newDocument(!this.doc.key)
        },
        {
          el: $('#box2 .duplicate'),
          label: 'Duplicate & Edit',
          shortcutDescription: 'control + d',
          shortcut: (evt) => this.doc.locked && evt.ctrlKey && evt.key.toLowerCase() === 'd',
          action: () => this.duplicateDocument()
        },
        {
          el: $('#box2 .raw'),
          label: 'Just Text',
          shortcutDescription: 'control + shift + r',
          shortcut: (evt) => evt.ctrlKey && evt.shiftKey && evt.key.toLowerCase() === 'r',
          action: () => {
            window.location.href = '/raw/' + encodeURIComponent(this.doc.key);
          }
        },
        {
          el: $('#box2 .twitter'),
          label: 'Twitter',
          shortcutDescription: 'control + shift + t',
          shortcut: (evt) => this.options.twitter && this.doc.locked &&
            evt.shiftKey && evt.ctrlKey && evt.key.toLowerCase() === 't',
          action: () => {
            const url = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(window.location.href);
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }
      ];
      for (const button of this.buttons) this.configureButton(button);
    }

    configureButton(options) {
      const box3 = $('#box3');
      const pointer = $('#pointer');
      options.el.addEventListener('click', (evt) => {
        evt.preventDefault();
        if (options.el.classList.contains('enabled')) options.action();
      });
      options.el.addEventListener('mouseenter', () => {
        $('#box3 .label').textContent = options.label;
        $('#box3 .shortcut').textContent = options.shortcutDescription || '';
        box3.hidden = false;
        options.el.appendChild(pointer);
        pointer.hidden = false;
      });
      options.el.addEventListener('mouseleave', () => {
        box3.hidden = true;
        pointer.hidden = true;
      });
    }

    configureShortcuts() {
      document.body.addEventListener('keydown', (evt) => {
        for (const button of this.buttons) {
          if (button.shortcut(evt)) {
            evt.preventDefault();
            button.action();
            return;
          }
        }
      });
    }

    // Tab behavior in the textarea - 2 spaces per tab
    configureTabKey() {
      this.textarea.addEventListener('keydown', (evt) => {
        if (evt.key !== 'Tab' || evt.shiftKey || evt.ctrlKey || evt.metaKey || evt.altKey) return;
        evt.preventDefault();
        const ta = this.textarea;
        ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const app = new Haste('hastebin', { twitter: true });

    const route = () => {
      const path = window.location.pathname;
      if (path === '/') app.newDocument(true);
      else app.loadDocument(decodeURIComponent(path.substring(1)));
    };

    window.addEventListener('popstate', route);
    route();
  });
})();
