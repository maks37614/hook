'use strict';

const {app,BrowserWindow,dialog,ipcMain,shell}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {validateInstallPath,buildInstallArgs,folderScan,observedPercent}=require('./install-core.cjs');

const ASSETS=app.isPackaged?path.join(process.resourcesPath,'installer-assets'):path.join(__dirname,'assets');
const UI=path.join(__dirname,'ui.html');
const GUIDE=path.join(__dirname,'guide.html');
const WEBSITE='https://h00k.top/';
const languageCodes=['en','pl','ru','uk'];
let mainWindow=null,guideWindow=null,child=null,scanTimer=null,scanBusy=false;
let folder='',installedFolder='',language='en',shortcut=true,stage='welcome',progress=0;
let writtenBytes=0,installed=false,lastError='',startedAt=0;
const uiStrings=JSON.parse(fs.readFileSync(path.join(__dirname,'locales.json'),'utf8'));
let guideStrings={};

function filePath(name) {return path.join(ASSETS,name);}
function initialFolder() {
  const local=process.env.LOCALAPPDATA || path.join(app.getPath('home'),'AppData','Local');
  return path.join(local,'Programs','h00k Desktop');
}
function assertTrusted(sender) {
  if ((!mainWindow||sender!==mainWindow.webContents) && (!guideWindow||sender!==guideWindow.webContents))
    throw new Error('Untrusted setup sender');
}
function state(){
  return {language,folder,shortcut,stage,progress,writtenBytes,installed,installedFolder,error:lastError,
    ui:uiStrings,guide:guideStrings,version:manifest?.version||'0.1.10'};
}
function publish(){
  for(const w of [mainWindow,guideWindow])
    if(w&&!w.isDestroyed()&&!w.webContents.isLoading())w.webContents.send('setup:status',state());
}
function contentWindow(page,options){
  const w=new BrowserWindow({
    ...options,
    backgroundColor:'#070d18',
    icon:filePath('h00k.ico'),
    show:false,
    autoHideMenuBar:true,
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,
    },
  });
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',e=>e.preventDefault());
  w.loadFile(page).then(()=>{if(!w.isDestroyed()){w.show();publish();}}).catch(error=>console.error('Setup screen failed:',error.message));
  return w;
}
function showGuide() {
  if(!installed)return false;
  if(guideWindow&&!guideWindow.isDestroyed()){
    if(guideWindow.isMinimized())guideWindow.restore();
    guideWindow.show();guideWindow.focus();
    return true;
  }
  guideWindow=contentWindow(GUIDE,{width:870,height:650,minWidth:710,minHeight:530,title:'h00k Quick Start',frame:true});
  guideWindow.on('closed',()=>{guideWindow=null;});
  return true;
}
function defaultLanguage(input){return languageCodes.includes(input)?input:'en';}
async function verifyPayload(){
  const worker=filePath('h00k-worker.exe');
  const manifestPath=filePath('manifest.json');
  const parsed=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(parsed.worker!=='h00k-worker.exe'||typeof parsed.expectedInstalledBytes!=='number'||
     parsed.expectedInstalledBytes<10_000_000||!/^[a-f0-9]{64}$/i.test(parsed.workerSha256)) {
    throw new Error('Invalid bundled installer manifest');
  }
  const stat=fs.statSync(worker);
  if(stat.size!==parsed.workerBytes)throw new Error('Installer payload size mismatch');
  const hash=crypto.createHash('sha256');
  await new Promise((resolve,reject)=>{
    const stream=fs.createReadStream(worker);
    stream.on('data',chunk=>hash.update(chunk));stream.once('end',resolve);stream.once('error',reject);
  });
  if(hash.digest('hex').toLowerCase()!==parsed.workerSha256.toLowerCase()) {
    throw new Error('Installer package integrity verification failed');
  }
  return {worker,meta:parsed};
}
let manifest=null;
function stopScan(){if(scanTimer){clearInterval(scanTimer);scanTimer=null;}}
function scanProgress(total){
  if(scanBusy||!child)return;
  scanBusy=true;
  try {
    const scanned=folderScan(installedFolder,startedAt);
    // Progress is sampled from actual bytes written by NSIS. Never time-based.
    writtenBytes=Math.max(writtenBytes,scanned.bytes);
    progress=Math.max(progress,observedPercent(writtenBytes,total));
    publish();
  } catch(e){console.warn('Progress scan failed:',e.message);}
  finally {scanBusy=false;}
}
function finishFailure(error){
  stopScan();child=null;stage='error';lastError=String(error?.message||error||'Installation error');publish();
}
function ensureWritableFolder(target) {
  let nearest=target;
  while(!fs.existsSync(nearest)){
    const parent=path.dirname(nearest);
    if(parent===nearest)throw new Error('Cannot locate parent installation directory');
    nearest=parent;
  }
  fs.accessSync(nearest,fs.constants.W_OK);
  if(fs.existsSync(target)&&!fs.statSync(target).isDirectory())
    throw new Error('Installation destination is not a directory');
}
async function beginInstall(options){
  if(child||stage==='installing')throw new Error('Installation is already running');
  if(!options||typeof options!=='object')throw new Error('Missing install options');
  language=defaultLanguage(options.language);
  shortcut=options.shortcut===true;
  const target=validateInstallPath(options.folder,'win32');
  ensureWritableFolder(target);
  installedFolder=target;folder=target;
  writtenBytes=0;progress=0;lastError='';stage='installing';installed=false;publish();
  try{
    const verified=await verifyPayload();manifest=verified.meta;
    if(stage!=='installing')return;
    startedAt=Date.now();
    const args=buildInstallArgs({folder:target,language,shortcut});
    await new Promise((resolve,reject)=>{
      let settled=false;
      const proc=spawn(verified.worker,args,{shell:false,windowsHide:true,
        windowsVerbatimArguments:true,stdio:'ignore'});
      child=proc;
      scanTimer=setInterval(()=>scanProgress(verified.meta.expectedInstalledBytes),650);
      scanProgress(verified.meta.expectedInstalledBytes);
      proc.once('error',error=>{if(!settled){settled=true;reject(error);}});
      proc.once('exit',(code,signal)=>{
        if(settled)return;
        settled=true;
        stopScan();
        scanProgress(verified.meta.expectedInstalledBytes);
        if(code===0)resolve();else reject(new Error('Windows installer failed (exit '+code+', '+(signal||'no signal')+')'));
      });
    });
    child=null;
    const exe=path.join(target,manifest.appExecutable);
    if(!fs.existsSync(exe))throw new Error('Installation finished but the h00k executable is missing');
    progress=100;stage='complete';installed=true;publish();
    showGuide(); // always a separate window, never cram help into the 320px bar
  }catch(error){finishFailure(error);}
}
async function launchDesktop(){
  if(!installed)throw new Error('Please complete installation first');
  const exe=path.join(installedFolder,manifest.appExecutable);
  if(!fs.existsSync(exe))throw new Error('Installed h00k Desktop executable not found');
  const proc=spawn(exe,[],{detached:true,windowsHide:false,stdio:'ignore',shell:false});
  proc.unref();return true;
}
function registerHandlers(){
  ipcMain.handle('setup:initial',e=>{assertTrusted(e.sender);return state();});
  ipcMain.handle('setup:browse',async e=>{
    assertTrusted(e.sender);
    if(stage==='installing')throw new Error('Folder is locked during installation');
    const picked=await dialog.showOpenDialog(mainWindow,{
      title:'Choose h00k installation folder',defaultPath:folder,
      properties:['openDirectory','createDirectory'],
    });
    if(picked.canceled||!picked.filePaths.length)return null;
    folder=validateInstallPath(picked.filePaths[0],'win32');
    return folder;
  });
  ipcMain.handle('setup:start',async(e,options)=>{
    assertTrusted(e.sender);
    if(!mainWindow||e.sender!==mainWindow.webContents)throw new Error('Setup window required');
    // Acknowledge quickly; status/progress is published asynchronously.
    void beginInstall(options).catch(error=>finishFailure(error));
    return true;
  });
  ipcMain.handle('setup:close',e=>{
    assertTrusted(e.sender);
    if(stage==='installing')return false; // no abrupt partial install
    app.quit();return true;
  });
  ipcMain.handle('setup:guide',e=>{assertTrusted(e.sender);return showGuide();});
  ipcMain.handle('setup:launch',e=>{assertTrusted(e.sender);return launchDesktop();});
  ipcMain.handle('setup:website',e=>{assertTrusted(e.sender);return shell.openExternal(WEBSITE);});
}
app.whenReady().then(async()=>{
  if(process.platform!=='win32'){console.error('h00k setup is Windows-only');app.quit();return;}
  if(typeof app.setAppUserModelId==='function')app.setAppUserModelId('top.h00k.setup');
  folder=initialFolder();
  guideStrings=JSON.parse(fs.readFileSync(filePath('guide.json'),'utf8'));
  // Built-in verification path exercised by GitHub Windows CI without UI.
  if(process.argv.includes('--self-test')){
    try{const v=await verifyPayload();console.log('Installer payload OK',v.meta.version);app.exit(0);}
    catch(e){console.error(e);app.exit(1);}
    return;
  }
  registerHandlers();
  mainWindow=contentWindow(UI,{width:720,height:320,minWidth:640,minHeight:320,maxWidth:940,maxHeight:370,
    title:'h00k Setup',frame:false,resizable:true,roundedCorners:true});
  mainWindow.on('close',e=>{if(stage==='installing')e.preventDefault();});
  mainWindow.on('closed',()=>{mainWindow=null;if(!guideWindow)app.quit();});
}).catch(e=>{console.error(e);app.exit(1);});
app.on('window-all-closed',()=>{if(!child)app.quit();});
