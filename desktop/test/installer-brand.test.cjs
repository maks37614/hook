'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'build',name));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

test('Windows app executable and both installer icons use generated robot',()=>{
  assert.equal(pkg.build.win.icon,'build/h00k.ico');
  assert.equal(pkg.build.nsis.installerIcon,'build/h00k-installer.ico');
  assert.equal(pkg.build.nsis.uninstallerIcon,'build/h00k-installer.ico');
  // Installer and installed app must show the same original robot, not Electron/NSIS defaults.
  assert.deepEqual(read('h00k.ico'), read('h00k-installer.ico'));
  assert.equal(pkg.build.nsis.oneClick,false);
  assert.ok(pkg.scripts.predist.includes('brand-assets'));
  const icon=read('h00k.ico');
  assert.equal(icon.readUInt16LE(0),0);
  assert.equal(icon.readUInt16LE(2),1);
  const count=icon.readUInt16LE(4);
  assert.ok(count>=7,'multi-size icon for Start Menu and DPI scaling');
  const sizes=[];
  for(let i=0;i<count;i++){
    const at=6+i*16;
    const width=icon.readUInt8(at)||256, height=icon.readUInt8(at+1)||256;
    sizes.push(width);
    assert.equal(width,height);
    assert.equal(icon.readUInt16LE(at+6),32,'32bit icon');
    const size=icon.readUInt32LE(at+8),offset=icon.readUInt32LE(at+12);
    assert.ok(offset+size<=icon.length,'icon frame within file');
    assert.equal(icon.subarray(offset,offset+8).toString('hex'),'89504e470d0a1a0a','PNG-based ICO');
  }
  assert.ok(sizes.includes(16)&&sizes.includes(32)&&sizes.includes(48)&&sizes.includes(256));
});

test('assisted NSIS bitmaps use Windows compatible 24-bit RGB and correct dimensions',()=>{
  for(const [name,width,height] of [
    ['installerHeader.bmp',150,57],
    ['installerSidebar.bmp',164,314],
    ['uninstallerSidebar.bmp',164,314],
  ]){
    const file=read(name);
    assert.equal(file.subarray(0,2).toString(),'BM');
    assert.equal(file.readUInt32LE(2),file.length);
    assert.equal(file.readUInt16LE(28),24,'24bit BMP');
    assert.equal(file.readUInt32LE(30),0,'uncompressed BMP');
    assert.equal(file.readInt32LE(18),width);
    assert.equal(file.readInt32LE(22),height);
    assert.ok(file.length>20000);
  }
  const header=read('installerHeader.bmp');
  // Bright turquoise strip at the bottom of the h00k branded header.
  const stride=((150*3+3)&~3);
  const at=54+0*stride+18*3;
  assert.ok(header[at] >= 150,'blue channel in cyan header accent');
  assert.ok(header[at+1]>=100,'green channel in cyan header accent');
});

test('shortcut checkbox controls desktop link without changing start menu shortcut',()=>{
  const nsis=fs.readFileSync(path.join(root,'build','installer.nsh'),'utf8');
  for(const token of ['customWelcomePage','customInit','customPageAfterChangeDir',
    'NSD_CreateCheckbox','NSD_GetState','customInstall','newDesktopLink','oldDesktopLink']){
    assert.ok(nsis.includes(token),'NSIS missing '+token);
  }
  assert.match(nsis,/Delete "\$newDesktopLink"/);
  assert.doesNotMatch(nsis,/Delete "\$newStartMenuLink"/);
  assert.equal(pkg.build.nsis.createDesktopShortcut,true);
  assert.equal(pkg.build.nsis.createStartMenuShortcut,true);
});

test('desktop shortcut preference survives upgrades and can be explicitly overridden',()=>{
  const nsis=fs.readFileSync(path.join(root,'build','installer.nsh'),'utf8');
  assert.match(nsis,/ReadRegStr \$R8 SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}" "H00kDesktopShortcutChoice"/);
  assert.match(nsis,/WriteRegStr SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}" "H00kDesktopShortcutChoice"/);
  assert.ok(nsis.includes('"/NO_DESKTOP_SHORTCUT"'));
  assert.ok(nsis.includes('"/DESKTOP_SHORTCUT"'));
  assert.match(nsis,/CreateShortCut "\$newDesktopLink"/);
  assert.match(nsis,/WinShell::SetLnkAUMI/);
  assert.match(nsis,/!ifndef BUILD_UNINSTALLER/);
  const workflow=fs.readFileSync(path.join(root,'..','.github','workflows','h00k-desktop-windows.yml'),'utf8');
  assert.ok(workflow.includes('smoke-installer.ps1'));
  assert.ok(workflow.includes('SHA256SUMS.txt'));
});

test('generated installer image contains real cyan h00k eyes and a transparent surround', async()=>{
  const icon=read('h00k-installer.ico');
  const count=icon.readUInt16LE(4);
  const entries=Array.from({length:count},(_,i)=>{
    const off=6+i*16;
    return {width:icon.readUInt8(off)||256,offset:icon.readUInt32LE(off+12),size:icon.readUInt32LE(off+8)};
  });
  const biggest=entries.find(entry=>entry.width===256);
  assert.ok(biggest,'must include original-resolution 256x256 icon');
  const source=icon.subarray(biggest.offset,biggest.offset+biggest.size);
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,256);
  assert.equal(info.height,256);
  const index=(x,y)=>(y*info.width+x)*info.channels;
  assert.equal(data[index(0,0)+3],0,'transparent corner, no additional square branding');
  assert.equal(data[index(255,0)+3],0,'other corner also transparent');
  let cyan=0;
  let dark=0;
  for(let p=0;p<data.length;p+=info.channels){
    const [r,g,b,a]=data.subarray(p,p+4);
    if(a>=220&&r<180&&g>140&&b>170)cyan++;
    if(a>=220&&r<70&&g<90&&b<100)dark++;
  }
  assert.ok(cyan>=300,'cyan robot eyes visibly rendered in installer');
  assert.ok(dark>=1000,'original dark robot bezel visibly rendered');
  assert.ok(fs.statSync(path.join(root,'build','h00k-robot-preview.png')).size>1000);
  const svg=fs.readFileSync(path.join(root,'scripts','generate-installer-assets.cjs'),'utf8');
  assert.match(svg,/public.*h00k-robot-logo\.svg/);
  assert.match(svg,/No added panel, text, decorative border or stripe/);
});

test('Windows CI extracts and checks icon embedded in setup EXE',()=>{
  const workflow=fs.readFileSync(path.join(root,'..','.github','workflows','h00k-desktop-windows.yml'),'utf8');
  assert.ok(workflow.includes('verify-installer-icon.ps1'));
  assert.ok(workflow.includes('h00k-installer.ico'));
});
