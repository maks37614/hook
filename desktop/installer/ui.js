'use strict';
const api=window.h00kSetup;
const byId=id=>document.getElementById(id);
let view='welcome',language='en',shortcut=true,folder='',snap=null,showProgress=0;
let walkerTimer=null;
const labels=['welcome','folder','installing','complete','error'];
function locale(){return snap?.ui?.[language]||snap?.ui?.en||{};}
function t(key){return locale()[key]||key;}
function setText(id,value){byId(id).textContent=value;}
function translated(){
  const values={
    welcomeTitle:'welcome',welcomeDetail:'welcomeDetail',
    folderTitle:'folderTitle',folderSubtitle:'folderSubtitle',
    shortcutLabel:'shortcut',browse:'browse',back:'back',
    cancel:'cancel',next:'next',installTitle:'installing',
    installDetail:'installingDetail',completeTitle:'completed',
    completeDetail:'completedDetail',errorTitle:'error',
    guide:'openGuide',launch:'openApp',langLabel:'language',
  };
  for(const [id,key] of Object.entries(values))setText(id,t(key));
  // Keep the frameless window control compact in every locale. The translated
  // label belongs in accessibility text / tooltip, not inside the 28px button.
  byId('close').textContent='×';
  byId('close').setAttribute('aria-label',t('close'));
  byId('close').setAttribute('title',t('close'));
  document.documentElement.lang=language;
  byId('lang').value=language;
  byId('next').textContent=view==='folder'?t('install'):t('next');
  document.title=t('windowTitle');
  byId('lang').setAttribute('aria-label',t('language'));
  byId('path').setAttribute('aria-label',t('folder'));
  byId('walker').setAttribute('aria-label',t('robotLabel'));
  byId('track').setAttribute('aria-label',t('progressLabel'));
}
function placeRobot(){
  const track=byId('track');
  const walker=byId('walker');
  const width=track.clientWidth;
  const min=46,max=Math.max(min,width-46);
  walker.style.left=Math.round(min+(max-min)*showProgress/100-46)+'px';
}
function moving(on){
  const walker=byId('walker');walker.classList.toggle('walking',on);
  if(walkerTimer){clearTimeout(walkerTimer);walkerTimer=null;}
  if(on)walkerTimer=setTimeout(()=>walker.classList.remove('walking'),850);
}
function setProgress(p){
  const next=Math.max(0,Math.min(100,Number(p)||0));
  const growing=next>showProgress&&view==='installing';
  showProgress=next;
  byId('trackFill').style.width=next+'%';
  byId('track').setAttribute('aria-valuenow',String(next));
  byId('percent').textContent=next+'%';
  placeRobot();
  if(growing)moving(true);
  if(next===100)moving(false);
}
function changeStage(stage){
  view=labels.includes(stage)?stage:'welcome';
  byId('shell').dataset.stage=view;
  for(const name of labels)byId(name==='installing'?'installStage':name+'Stage').hidden=(name!==view);
  const inProgress=view==='installing',complete=view==='complete',failed=view==='error';
  byId('back').hidden=view!=='folder';
  byId('cancel').hidden=complete;
  byId('cancel').disabled=inProgress;
  byId('next').hidden=inProgress||complete;
  byId('next').textContent=failed?t('retry'):view==='folder'?t('install'):t('next');
  byId('guide').hidden=!complete;
  byId('launch').hidden=!complete;
  byId('lang').disabled=inProgress;
  if(view==='folder'&&showProgress!==0)setProgress(0);
  if(view==='welcome')setProgress(0);
  translated();
}
function sync(payload){
  if(!payload)return;
  snap=payload;
  folder=payload.folder||folder;
  shortcut=payload.shortcut!==false;
  if(['installing','complete','error'].includes(payload.stage)){
    language=payload.language||language;
    if(view!==payload.stage)changeStage(payload.stage);
    if(payload.stage==='installing'){
      const totalBytes=payload.writtenBytes||0;
      setText('byteDetail',totalBytes>0
        ?t('observed')+': '+(totalBytes/1048576).toFixed(1)+' MB'
        :t('finalizing'));
    }
    if(payload.stage==='error')setText('errorDetail',payload.error||t('unavailable'));
    setProgress(payload.progress);
  }
  byId('path').value=folder;
  byId('shortcut').checked=shortcut;
  translated();
}
byId('lang').addEventListener('change',()=>{
  language=byId('lang').value;
  translated();
});
byId('next').addEventListener('click',async()=>{
  if(view==='welcome'||view==='error'){
    changeStage('folder');return;
  }
  if(view!=='folder')return;
  try{
    changeStage('installing');
    setProgress(0);
    await api.start({folder,language,shortcut:byId('shortcut').checked});
  }catch(error){changeStage('error');setText('errorDetail',String(error?.message||error));}
});
byId('back').addEventListener('click',()=>{if(view==='folder')changeStage('welcome');});
byId('cancel').addEventListener('click',async()=>{try{await api.close();}catch(error){console.error(error);}});
byId('close').addEventListener('click',async()=>{try{await api.close();}catch(error){console.error(error);}});
byId('browse').addEventListener('click',async()=>{
  try{const selected=await api.browse();if(selected){folder=selected;byId('path').value=folder;}}
  catch(error){changeStage('error');setText('errorDetail',String(error?.message||error));}
});
byId('guide').addEventListener('click',()=>void api.showGuide());
byId('launch').addEventListener('click',()=>void api.launch().catch(e=>{setText('errorDetail',String(e));changeStage('error');}));
byId('shortcut').addEventListener('change',()=>{shortcut=byId('shortcut').checked;});
document.addEventListener('pointermove',event=>{
  const nx=(event.clientX/window.innerWidth-.5)*5.4;
  const ny=(event.clientY/window.innerHeight-.5)*4.4;
  const robot=byId('walker');
  robot.style.setProperty('--look-x',Math.max(-2.6,Math.min(2.6,nx)).toFixed(2)+'px');
  robot.style.setProperty('--look-y',Math.max(-2.2,Math.min(2.2,ny)).toFixed(2)+'px');
},{passive:true});
window.addEventListener('resize',placeRobot);
api.onStatus(sync);
api.initial().then(initial=>{
  snap=initial;
  language='en'; // English always default on a fresh launcher; explicit choices can override.
  folder=initial.folder;
  shortcut=initial.shortcut!==false;
  changeStage(initial.stage);
  sync(initial);
  placeRobot();
}).catch(error=>{changeStage('error');setText('errorDetail',String(error));});
