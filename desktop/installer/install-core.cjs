'use strict';

const fs = require('node:fs');
const path = require('node:path');

function validateInstallPath(value, platform = process.platform) {
  if (platform !== 'win32') throw new Error('Windows is required for installation');
  if (typeof value !== 'string' || value.length < 4 || value.length > 240 ||
      /["\r\n\0]/.test(value)) throw new Error('Invalid installation folder');
  const target = path.win32.normalize(value.trim());
  if (!/^[A-Za-z]:\\[^\\]/.test(target) || target.startsWith('\\\\')) {
    throw new Error('Choose a local folder under a drive letter');
  }
  const lower = target.toLowerCase().replace(/\\+$/, '');
  if (/^[a-z]:\\(?:windows|program files(?: \(x86\))?|programdata|users|system volume information)$/i.test(lower)) {
    throw new Error('Choose a dedicated h00k folder, not a system directory');
  }
  if (target.split('\\').some(segment => segment === '..')) throw new Error('Invalid folder traversal');
  return target;
}

function buildInstallArgs({ folder, language = 'en', shortcut = true }) {
  const selected = ['en','pl','ru','uk'].includes(language) ? language : 'en';
  const destination = validateInstallPath(folder, 'win32');
  // NSIS requires /D= to be last and UNQUOTED, including when folder has spaces.
  return ['/S', '/H00K_LANG=' + selected, shortcut ? '/DESKTOP_SHORTCUT' : '/NO_DESKTOP_SHORTCUT', '/D=' + destination];
}

function folderScan(root, afterEpochMs, maxEntries = 6000) {
  const pending = [root], seen = new Set();
  let total = 0, count = 0;
  while (pending.length && count < maxEntries) {
    const dir = pending.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const item of entries) {
      if (++count > maxEntries) break;
      const name = path.join(dir,item.name);
      if (item.isDirectory()) {
        pending.push(name);
      } else if (item.isFile()) {
        try {
          const stat = fs.statSync(name);
          // NSIS may restore the archived mtime. Creation/change timestamps
          // still reflect actual extraction on the machine, including upgrades.
          if (Math.max(stat.mtimeMs,stat.ctimeMs,stat.birthtimeMs) >= afterEpochMs - 2000) {
            const normalized = path.relative(root, name).toLowerCase();
            // Files may be moved into place by NSIS. Count only actual installed files.
            if (!seen.has(normalized)) { total += stat.size; seen.add(normalized); }
          }
        } catch { /* file in the middle of extraction */ }
      }
    }
  }
  return { bytes:total, files:seen.size };
}

function observedPercent(bytes, expectedBytes) {
  if (!Number.isFinite(bytes) || !Number.isFinite(expectedBytes) || expectedBytes <= 0) return 0;
  return Math.min(96, Math.max(0, Math.floor(100 * bytes / expectedBytes)));
}

function safeURL(value) {
  return value === 'https://h00k.top/' || value === 'https://h00k.top';
}
module.exports = { validateInstallPath, buildInstallArgs, folderScan, observedPercent, safeURL };
