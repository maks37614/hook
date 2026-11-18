'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const desktop=path.join(__dirname,'..');
const app=require('../package.json');
const setup=require('../installer/package.json');
const locales=['en-US','pl','ru','uk'];

test('Desktop packaging preserves a small, explicit application file list',()=>{
  const files=app.build.files;
  assert.ok(Array.isArray(files)&&files.length>0);
  for(const file of files){
    assert.ok(!/[*?!]/.test(file),'app files must remain explicitly enumerated: '+file);
    assert.ok(fs.statSync(path.join(desktop,file)).isFile(),'missing runtime file: '+file);
    assert.ok(!/(^|\/)(test|tests|scripts|node_modules|dist|build)(\/|$)/.test(file),
      'developer assets must not be shipped: '+file);
  }
  assert.ok(files.includes('settings.html'));
  assert.ok(files.includes('settings-i18n.js'));
  assert.ok(files.includes('layout.cjs'));
  assert.deepEqual(app.build.extraResources,[{from:'win-agent.ps1',to:'win-agent.ps1'}]);
});

test('Both Electron runtimes retain only four supported UI locale packs',()=>{
  for(const pkg of [app,setup]){
    assert.deepEqual(pkg.build.electronLanguages,locales);
    assert.equal(pkg.build.asar,true);
    const expected = pkg === setup ? 'maximum' : 'normal';
    assert.equal(pkg.build.compression,expected,
      'keep the animated launcher maximally compressed while preserving Desktop NSIS compatibility');
  }
});

test('Animated setup keeps the original first-run UI and a single NSIS worker',()=>{
  const files=setup.build.files;
  for(const name of ['main.cjs','preload.cjs','ui.html','ui.css','ui.js',
    'guide.html','guide.js','guide.css','locales.json','install-core.cjs']){
    assert.ok(files.includes(name),'missing installer UX/runtime asset: '+name);
  }
  assert.deepEqual(setup.build.extraResources,[{from:'assets',to:'installer-assets'}]);
  assert.ok(files.includes('!node_modules/**'));
  const source=fs.readFileSync(path.join(desktop,'installer','prepare.cjs'),'utf8');
  assert.match(source,/workerSha256/);
  assert.match(source,/expectedInstalledFiles/);
  const script=fs.readFileSync(path.join(desktop,'scripts','package-size-audit.ps1'),'utf8');
  assert.match(script,/nsisInstallerBytes/);
  assert.match(script,/animatedInstallerBytes/);
  assert.match(script,/installedBytes/);
});
