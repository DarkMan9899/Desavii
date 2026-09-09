/**
 * staticServer — minimal static file server with SPA fallback, used by
 * `scripts/prerender.mjs` to serve `dist/` locally so Playwright can visit
 * real routes before any real static host exists in front of this build.
 *
 * Resolution order mirrors how a production static host with an SPA
 * rewrite rule (Netlify/Vercel/S3+CloudFront/nginx `try_files`) behaves —
 * this repo doesn't control production hosting, but documents the exact
 * rule it needs (see prerender.mjs's header comment):
 *   1. An exact file match (`/assets/index-abc.js`) is served as-is.
 *   2. `/<path>/index.html` is served when it exists — this is what makes
 *      a prerendered route (`dist/en/categories/hotels/index.html`) win
 *      over the SPA fallback.
 *   3. Otherwise, the root `dist/index.html` (the plain CSR shell) is
 *      served with a 200 — client-side routing takes over for every
 *      route this pipeline didn't prerender (private pages, Search,
 *      unknown paths — which the SPA's own router resolves to its 404
 *      page client-side).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function resolveFile(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const candidate = path.join(root, safePath);

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  const indexCandidate = path.join(candidate, 'index.html');
  if (fs.existsSync(indexCandidate)) {
    return indexCandidate;
  }
  return null;
}

/** @returns {Promise<{server: http.Server, port: number, close: () => Promise<void>}>} */
export function startStaticServer(root, { port = 0 } = {}) {
  const server = http.createServer((req, res) => {
    const filePath =
      resolveFile(root, req.url) ?? path.join(root, 'index.html');
    const ext = path.extname(filePath);
    res.setHeader(
      'Content-Type',
      MIME_TYPES[ext] ?? 'application/octet-stream',
    );
    fs.createReadStream(filePath)
      .on('error', () => {
        res.statusCode = 404;
        res.end('Not found');
      })
      .pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      resolve({
        server,
        port: actualPort,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

export default startStaticServer;
