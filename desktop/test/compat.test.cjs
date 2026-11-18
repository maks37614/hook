'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const compat=require('../os-compat.cjs');
const chrome=require('../standalone-chrome.cjs');
test('detect Windows 7, 8, 8.1 and guard overlay on unsupported systems',()=>{
  for(const version of ['6.1.7601','6.2.9200','6.3.9600'])
    assert.equal(compat.isLegacyWindows('win32',version),true);
  for(const version of ['10.0.19045','10.0.26100'])
    assert.equal(compat.isLegacyWindows('win32',version),false);
  assert.equal(compat.isLegacyWindows('linux','6.1.7601'),false);
  assert.equal(compat.supportsOverlay('win32','6.1.7601','22.3.27'),false);
  assert.equal(compat.supportsOverlay('win32','10.0.19045','22.3.27'),false);
  assert.equal(compat.supportsOverlay('win32','10.0.19045','45.0.0'),true);
  assert.deepEqual(chrome.standaloneWindowChrome('win32','6.1.7601','22.3.27'),{});
  assert.equal(chrome.standaloneToolbarInset('win32','6.2.9200','22.3.27'),0);
  assert.equal(chrome.standaloneWindowChrome('win32').frame,false);
});
test('unmaintained Electron shows cancel-by-default warning',()=>{
  assert.equal(compat.LEGACY_ELECTRON_VERSION,'22.3.27');
  assert.equal(compat.isUnmaintainedElectron('22.3.27'),true);
  assert.equal(compat.isUnmaintainedElectron('45.0.0'),false);
  assert.equal(compat.legacyBrowserWarning().defaultId,0);
  assert.equal(compat.legacyBrowserWarning().cancelId,0);
  assert.match(compat.legacyBrowserWarning().detail,/API-ключ/);
  const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
  assert.match(main,/dialog.showMessageBoxSync\(legacyBrowserWarning\(\)\)/);
  assert.match(main,/const useLegacyView = typeof WebContentsView !== 'function'/);
  assert.match(main,/if \(useLegacyView\) win.setBrowserView\(toolbar\)/);
  assert.match(main,/nodeIntegration: false, contextIsolation: true, sandbox: true/);
});

test('isolated legacy preview build and opt-in CI trigger',()=>{
  const config=require('../electron-builder-legacy.config.cjs');
  const pkg=require('../package.json');
  assert.equal(config.electronVersion,'22.3.27');
  assert.notEqual(config.appId,pkg.build.appId);
  assert.equal(config.directories.output,'dist-legacy');
  assert.match(config.nsis.artifactName,/LEGACY Win7-8/);
  assert.ok(pkg.build.files.includes('os-compat.cjs'));
  const wf=fs.readFileSync(path.join(root,'..','.github','workflows','h00k-desktop-windows.yml'),'utf8');
  assert.match(wf,/legacy_preview/);
  assert.match(wf,/electron-builder-legacy.config.cjs/);
  assert.match(wf,/EXPERIMENTAL-EOL-UNSUPPORTED/);
});

test('Win7 PowerShell 2.0 falls back to a built-in JSON serializer',()=>{
  const ps=fs.readFileSync(path.join(root,'win-agent.ps1'),'utf8');
  assert.ok(ps.includes('Get-Command ConvertTo-Json -ErrorAction SilentlyContinue'));
  assert.ok(ps.includes('Add-Type -AssemblyName System.Web.Extensions'));
  assert.ok(ps.includes('JavaScriptSerializer'));
  assert.ok(ps.includes('$legacySerializer.Serialize($current)'));
  assert.ok(ps.includes('ConvertTo-Json -InputObject $current -Depth 4 -Compress'));
});
