import express, { type Express } from 'express';
import path from 'node:path';

// Keep existing entry URLs for the hash-routed app and old bookmarks.
const LEGACY_APP_PATHS = new Set(['/screener', '/patterns', '/terminal', '/replay', '/surveillance', '/pc', '/welcome']);
const SEO_STATIC_FILE = /^(?:robots\.txt|sitemap\.xml|seo[/\\]landing\.css|(?:uk|en|pl|ru)[/\\][a-z0-9-]+\.html)$/;

/** Hashed bundles are immutable. Missing bundles must never receive SPA HTML. */
export function installProductionAssets(app: Express, distPath: string): void {
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    immutable: true, maxAge: '1y',
  }));
  app.use('/assets', (_req, res) => {
    res.status(404).type('text/plain').send('Asset not found');
  });
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const pathname = req.path;
    if (pathname === '/api' || pathname.startsWith('/api/')) return next();
    const legal = /^\/(terms|privacy)(?:\.html)?\/*$/.exec(pathname)?.[1];
    const canonicalPath = pathname === '/index.html' ? '/' : legal ? '/' + legal : pathname;
    const isAliasHost = req.hostname?.toLowerCase() === 'www.h00k.top';
    if (canonicalPath === pathname && !isAliasHost) return next();
    const queryStart = req.originalUrl.indexOf('?');
    const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
    const origin = isAliasHost ? 'https://h00k.top' : '';
    res.redirect(308, `${origin}${canonicalPath}${query}`);
  });
  // Explicit *.html product guides are served as files, not intercepted by SPA fallback.
  app.use(express.static(distPath, {
    index: false,
    redirect: false,
    setHeaders(res, file) {
      if (SEO_STATIC_FILE.test(path.relative(distPath, file))) {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    const pathname = req.path.replace(/\/+$/, '') || '/';
    if (pathname === '/terms' || pathname === '/privacy') {
      res.sendFile(path.join(distPath, pathname === '/terms' ? 'terms.html' : 'privacy.html'));
      return;
    }
    if (req.path === '/' || LEGACY_APP_PATHS.has(pathname)) {
      const isAccountLink = 'verifyEmail' in req.query || 'resetPassword' in req.query;
      if (isAccountLink) res.setHeader('Cache-Control', 'no-store');
      if (isAccountLink || pathname !== '/') {
        res.setHeader('X-Robots-Tag', 'noindex');
      }
      res.sendFile(path.join(distPath, 'index.html'));
      return;
    }
    res.status(404).type('text/plain').send('Page not found');
  });
}
