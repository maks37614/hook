import type { Plugin } from 'vite';
import { createSeoAssets } from './guideAssets.ts';
import { legalPages, renderLegalHtml } from './legalAssets.ts';

export function seoPages(): Plugin {
  return {
    name: 'h00k-seo-pages',
    configureServer(server) {
      const files = createSeoAssets();
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const fileName = req.url?.split('?', 1)[0].slice(1) ?? '';
        const source = files.get(fileName);
        if (!source) return next();
        res.setHeader('Content-Type', fileName === 'sitemap.xml'
          ? 'application/xml; charset=utf-8'
          : 'text/html; charset=utf-8');
        res.end(req.method === 'HEAD' ? undefined : source);
      });
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const [fileName, source] of createSeoAssets()) {
          this.emitFile({ type: 'asset', fileName, source });
        }
        const shell = bundle['index.html'];
        if (shell?.type !== 'asset' || typeof shell.source !== 'string') {
          this.error('Expected built index.html before generating legal HTML');
        }
        for (const page of legalPages) {
          this.emitFile({ type: 'asset', fileName: `${page}.html`, source: renderLegalHtml(shell.source, page) });
        }
      },
    },
  };
}
