'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {LANGUAGES,nativeT,rows}=require('../native-i18n.cjs');
const desktop=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(desktop,name),'utf8');

test('native gear menu has every label in all four supported languages',()=>{
  assert.deepEqual(LANGUAGES,['uk','en','pl','ru']);
  const keys=['settingsTitle','dockMenu','configure','browser','position','mode',
    'automatic','right','left','top','bottom','full','blocks','floating','multi',
    'detach','toolbarDocking','toolbarBrowser','toolbarEcoMenu','toolbarEcoEnable','toolbarEcoDisable','toolbarTitle','toolbarAria','toolbarMinimize','toolbarFullscreen','toolbarExitFullscreen','toolbarClose'];
  assert.deepEqual(Object.keys(rows),keys);
  for(const key of keys){
    for(const [index,lang] of LANGUAGES.entries()){
      assert.equal(typeof rows[key][index],'string');
      assert.ok(rows[key][index].trim(),'missing '+lang+'.'+key);
      assert.equal(nativeT(key,lang),rows[key][index]);
    }
  }
  for(const lang of LANGUAGES) {
    assert.match(nativeT('toolbarEcoEnable',lang),/ECO/);
    assert.match(nativeT('toolbarEcoDisable',lang),/ECO/);
  }
  assert.equal(nativeT('mode','en'),'Mode');
  assert.equal(nativeT('position','pl'),'Położenie');
  assert.equal(nativeT('detach','ru'),'Открепить от ');
});

test('native language is validated and stored without changing terminal profiles',()=>{
  const {normalizeSettings}=require('../profiles.cjs');
  assert.equal(normalizeSettings().uiLanguage,'uk');
  assert.equal(normalizeSettings({uiLanguage:'pl'}).uiLanguage,'pl');
  assert.equal(normalizeSettings({uiLanguage:'fake'}).uiLanguage,'uk');
  const setting=normalizeSettings({uiLanguage:'en',profiles:{tiger:{mode:'multi',side:'auto'}}});
  assert.equal(setting.uiLanguage,'en');
  assert.equal(setting.profiles.tiger.mode,'multi');
  assert.equal(setting.profiles.tiger.side,'auto');
  assert.ok(require('../package.json').build.files.includes('native-i18n.cjs'));
});

test('main process localizes both gear menus from trusted settings events',()=>{
  const main=read('main.cjs'),preload=read('preload.cjs'),toolbar=read('toolbar.html');
  const nativeKeys=[...main.matchAll(/tr\('([^']+)'\)/g)].map(m=>m[1]);
  for(const key of nativeKeys)assert.ok(Object.hasOwn(rows,key),'unknown native menu translation '+key);
  assert.match(main,/ipcMain\.handle\('desktop:set-language'/);
  assert.match(main,/verifySettingsSender\(event\)/);
  assert.match(main,/LANGUAGES\.includes\(language\)/);
  assert.match(preload,/setLanguage: language => ipcRenderer\.invoke\('desktop:set-language', language\)/);
  assert.match(main,/ipcMain\.handle\('desktop:toolbar-language'/);
  assert.match(main,/toolbarOwners\.get\(event\.sender\.id\)/);
  assert.match(main,/owner\.contents !== event\.sender/);
  assert.match(toolbar,/h00kDockButton\.language\(\)/);
  assert.match(toolbar,/h00kDockButton\.onLanguage\(labels\)/);
});

test('logo captions have been removed, not important installer controls',()=>{
  const setup=read('installer/ui.template.html'),guide=read('installer/guide.html'),settings=read('settings.html');
  assert.doesNotMatch(setup,/brand-version|id="productTitle"|DESKTOP SETUP/);
  assert.doesNotMatch(guide,/DESKTOP · QUICK START/);
  assert.doesNotMatch(settings,/<h1>Desktop<\/h1>|ВАШ ТОРГОВИЙ ПРОСТІР · WINDOWS/);
  assert.match(setup,/id="lang"/);
  assert.match(setup,/id="walker"/);
  assert.match(setup,/id="track"/);
  assert.match(setup,/id="launch"/);
  assert.match(guide,/id="steps"/);
  assert.match(settings,/id="modes"/);
});

test('all installer and first-run guide strings are available in four languages',()=>{
  const ui=require('../installer/locales.json');
  const guide=require('../i18n/installer.json');
  const js=read('installer/ui.js')+'\n'+read('installer/guide.js');
  const keys=[...new Set([...js.matchAll(/\bt\('([^']+)'\)/g)].map(match=>match[1]))];
  for(const lang of ['en','pl','ru','uk']){
    assert.deepEqual(Object.keys(ui[lang]),Object.keys(ui.en));
    assert.deepEqual(Object.keys(guide[lang]),Object.keys(guide.en));
    for(const key of keys)assert.ok(ui[lang][key]?.trim(),'missing '+lang+'.'+key);
    for(const key of ['guide1','guide2','guide3','guide4','guide5',
      'api1','api2','api3','api4','api5','guideFooter']){
      assert.ok(guide[lang][key]?.trim(),'missing guide '+lang+'.'+key);
    }
  }
  assert.match(js,/setAttribute\('aria-label',t\('robotLabel'\)\)/);
  assert.match(js,/setAttribute\('aria-label',t\('progressLabel'\)\)/);
  assert.match(js,/document\.title=t\('windowTitle'\)/);
  assert.match(js,/document\.title=t\('guideTitle'\)/);
});
