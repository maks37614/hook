'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../install-core.cjs');

test('only a validated Windows local folder can be passed to NSIS',()=>{
  assert.equal(core.validateInstallPath('C:\\Users\\Trader\\AppData\\Local\\Programs\\h00k Desktop','win32'),
    'C:\\Users\\Trader\\AppData\\Local\\Programs\\h00k Desktop');
  for(const value of ['C:\\','C:\\Windows','C:\\Users','\\\\server\\share\\setup',
    'D:relative','C:\\Fake"\n/S','']) {
    assert.throws(()=>core.validateInstallPath(value,'win32'),value);
  }
  assert.throws(()=>core.validateInstallPath('/tmp/h00k','linux'));
});
test('NSIS install destination is always the last raw argument',()=>{
  const args=core.buildInstallArgs({folder:'C:\\Users\\John Doe\\AppData\\Local\\h00k',language:'uk',shortcut:false});
  assert.deepEqual(args,['/S','/H00K_LANG=uk','/NO_DESKTOP_SHORTCUT','/D=C:\\Users\\John Doe\\AppData\\Local\\h00k']);
  assert.deepEqual(core.buildInstallArgs({folder:'D:\\Apps\\h00k',language:'??',shortcut:true}),
    ['/S','/H00K_LANG=en','/DESKTOP_SHORTCUT','/D=D:\\Apps\\h00k']);
});
test('reported progress is based on observed bytes, never elapsed time',()=>{
  assert.equal(core.observedPercent(0,100),0);
  assert.equal(core.observedPercent(20,100),20);
  assert.equal(core.observedPercent(100,100),96);
  assert.equal(core.observedPercent(200,100),96);
  assert.equal(core.observedPercent(50,0),0);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'h00k-setup-test-'));
  try{
    const started=Date.now();
    fs.mkdirSync(path.join(root,'resources'));
    fs.writeFileSync(path.join(root,'h00k Desktop.exe'),Buffer.alloc(4096));
    fs.writeFileSync(path.join(root,'resources','app.asar'),Buffer.alloc(8192));
    // NSIS may preserve a source archive's old modification timestamp;
    // a newly extracted file still counts as real disk activity.
    const oldTime=new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(path.join(root,'resources','app.asar'),oldTime,oldTime);
    const actual=core.folderScan(root,started);
    assert.equal(actual.files,2);
    assert.equal(actual.bytes,12288);
    const future=core.folderScan(root,started+120_000);
    assert.equal(future.bytes,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('UI uses genuine h00k eyes, moving legs and a separate guide page',()=>{
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  const template=read('ui.template.html'),css=read('ui.css'),ui=read('ui.js'),main=read('main.cjs'),guide=read('guide.html');
  assert.match(template,/ROBOT_FACE_FROM_H00K_TOP/);
  assert.match(template,/class="leg leg-left"/);
  assert.match(template,/class="leg leg-right"/);
  assert.match(css,/@keyframes blink/);
  assert.match(css,/@keyframes step/);
  assert.match(ui,/pointermove/);
  assert.match(ui,/next>showProgress&&view==='installing'/);
  assert.match(main,/folderScan\(installedFolder,startedAt\)/);
  assert.match(main,/showGuide\(\)/);
  assert.match(guide,/guide\.js/);
  assert.match(template,/id="browse"/);
  assert.match(template,/id="shortcut"/);
  assert.match(main,/windowsVerbatimArguments:true/);
  assert.match(main,/shell:false/);
});
test('every setup and guide UI string is translated and English is first',()=>{
  const data=require('../locales.json');
  assert.deepEqual(Object.keys(data),['en','pl','ru','uk']);
  const keys=Object.keys(data.en);
  assert.ok(keys.length>=35);
  for(const language of Object.keys(data)){
    assert.deepEqual(Object.keys(data[language]),keys);
    for(const key of keys)assert.ok(data[language][key].trim(), language+'.'+key);
  }
  assert.match(fs.readFileSync(path.join(__dirname,'..','ui.js'),'utf8'),/language='en'/);
});
test('portable manifest is generated from an existing NSIS .exe and actual unpacked app',()=>{
  const prepare=fs.readFileSync(path.join(__dirname,'..','prepare.cjs'),'utf8');
  assert.match(prepare,/h00k Desktop Setup/);
  assert.match(prepare,/win-unpacked/);
  assert.match(prepare,/workerSha256/);
  assert.match(prepare,/h00k-robot-logo.svg/);
  assert.match(prepare,/expectedInstalledBytes/);
  assert.match(prepare,/guide.json/);
});

test('Quick Start begins directly with steps and keeps compact spacing in the packaged installer',()=>{
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  const html=read('guide.html'),css=read('guide.css'),js=read('guide.js');
  assert.match(html,/<\/header>\s*<div class="steps-head">/);
  assert.doesNotMatch(html,/class="intro"|class="eyemark"|id="guideTitle"|id="guideIntro"|h00k robot logo/);
  assert.doesNotMatch(js,/find\('guideTitle'\)|find\('guideIntro'\)/);
  assert.match(css,/\.guide\{[^}]*gap:8px/);
  assert.match(css,/header\{padding-bottom:10px;/);
  assert.match(css,/\.steps-head\{padding:2px 0;/);
  assert.match(css,/#steps\{[^}]*padding:5px 0;/);
  for(const id of ['lang','page','steps','safety','back','next','website','launch'])
    assert.ok(html.includes('id="'+id+'"'),'keep Quick Start control '+id);
});

test('frameless installer Close button stays within its fixed width in all four languages',()=>{
  const vm=require('node:vm');
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  const js=read('ui.js'),css=read('ui.css'),html=read('ui.template.html');
  const translated=js.match(/function translated\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(translated,'find the language update function');
  assert.match(html,/<button class="window-close"[^>]*id="close"[^>]*>×<\/button>/);
  assert.match(css,/\.window-close\{[^}]*flex:0 0 28px/);
  assert.match(css,/\.window-close\{[^}]*padding:0/);
  assert.match(css,/\.right-title\{[^}]*flex:0 0 auto/);
  const dictionaries=require('../locales.json');
  for(const language of ['en','uk','ru','pl']){
    const nodes=Object.create(null);
    const byId=id=>nodes[id] ||= {
      textContent:'',attributes:Object.create(null),
      setAttribute(name,value){this.attributes[name]=value;}
    };
    const document={documentElement:{lang:'en'}};
    const t=key=>dictionaries[language][key]||key;
    const context={byId,setText:(id,value)=>{byId(id).textContent=value;},t,language,document,view:'complete'};
    vm.runInNewContext(translated+'; translated();',context);
    assert.equal(byId('close').textContent,'×','show icon for '+language);
    assert.equal(byId('close').attributes.title,dictionaries[language].close);
    assert.equal(byId('close').attributes['aria-label'],dictionaries[language].close);
    assert.equal(document.documentElement.lang,language);
  }
});
