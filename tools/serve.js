#!/usr/bin/env node
/*
 * A tiny static file server for trying the page on your own computer, so the
 * service worker (offline mode) and "install" work. No dependencies.
 *
 *   npm start            then open http://localhost:8080
 *   PORT=3000 npm start
 *
 * It listens on this computer only and serves files from this folder.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || /(^|[\\/])\./.test(path.relative(ROOT, file))) {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('Shift Handoff is running at http://localhost:' + PORT + '  (Ctrl+C to stop)');
});
