const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 8080;
const ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/**
 * Directory-style routes that production serves with a trailing slash.
 *
 * Production (GitHub Pages behind Cloudflare) responds 301 to the canonical
 * trailing-slash form. The local server previously rewrote these silently with
 * a 200, which meant a whole class of routing behaviour could not be reproduced
 * or tested locally. These redirects close that local-vs-production gap.
 *
 * Set TEST_SERVER_NO_REDIRECT=1 to restore the legacy silent-rewrite behaviour
 * if a specific test needs to exercise pre-redirect rendering.
 */
const REDIRECT_TO_SLASH = ['/portfolio', '/redesign'];
const NO_REDIRECT = process.env.TEST_SERVER_NO_REDIRECT === '1';

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Production-faithful redirect: /portfolio -> /portfolio/ (and /redesign).
  // Preserves any query string, mirroring how the real host behaves.
  if (!NO_REDIRECT && REDIRECT_TO_SLASH.includes(pathname)) {
    const search = parsedUrl.search || '';
    res.writeHead(301, { 'Location': pathname + '/' + search });
    res.end();
    return;
  }

  if (pathname === '/portfolio/' || pathname === '/redesign/') {
    pathname = pathname + 'index.html';
  } else if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(ROOT, pathname);

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const notFoundPath = path.join(ROOT, '404.html');
      fs.readFile(notFoundPath, (err404, data404) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data404 || 'Not Found');
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const isCompressible = /^(text\/|application\/(javascript|json|xml)|image\/svg\+xml)/.test(contentType);

    if (isCompressible && acceptEncoding.includes('gzip')) {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Encoding': 'gzip',
        'Vary': 'Accept-Encoding'
      });
      fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  const mode = NO_REDIRECT ? 'legacy no-redirect' : 'production-faithful (301 trailing-slash)';
  console.log(`Test static server running at http://localhost:${PORT} (${mode} mode)`);
});
