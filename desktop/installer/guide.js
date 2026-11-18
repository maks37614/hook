'use strict';
const api=window.h00kSetup;
const find=id=>document.getElementById(id);
let state=null,language='en',page=0;
const screens=[['guide1','guide2','guide3'],['guide4','guide5','api1','api2'],['api3','api4','api5','guideFooter']];
const texts=()=>state?.ui?.[language]||state?.ui?.en||{};
const help=()=>state?.guide?.[language]||state?.guide?.en||{};
const t=key=>texts()[key]||key;
function draw(){
  document.documentElement.lang=language;
  document.title=t('guideTitle');
  find('lang').setAttribute('aria-label',t('guideSelect'));
  const h=help();
  find('lang').value=language;
  find('langLabel').textContent=t('guideSelect');
  find('safety').textContent=t('security');
  find('page').textContent=t('step')+' '+(page+1)+' '+t('of')+' '+screens.length;
  const nodes=[];
  for(const key of screens[page]){
    const item=document.createElement('article');item.className='step';
    const num=document.createElement('span');num.className='step-number';
    const match=String(h[key]||'').match(/^(\d+)\./);num.textContent=match?match[1]:'✓';
    const desc=document.createElement('span');desc.textContent=h[key]||'';
    item.append(num,desc);nodes.push(item);
  }
  find('steps').replaceChildren(...nodes);
  for(const [i,child] of [...document.querySelectorAll('.segments span')].entries())
    child.classList.toggle('active',i<=page);
  find('back').textContent=t('guideBack');
  find('back').disabled=page===0;
  find('next').textContent=page===screens.length-1?t('guideFinish'):t('guideNext');
  find('website').textContent=t('guideWebsite');
  find('launch').textContent=t('guideOpen');
}
find('lang').addEventListener('change',()=>{language=find('lang').value;draw();});
find('back').addEventListener('click',()=>{page=Math.max(0,page-1);draw();});
find('next').addEventListener('click',()=>{if(page<screens.length-1){page++;draw();}else window.close();});
find('website').addEventListener('click',()=>void api.openWebsite());
find('launch').addEventListener('click',()=>void api.launch().catch(error=>{window.alert(String(error));}));
api.onStatus(next=>{if(next){state=next;draw();}});
api.initial().then(initial=>{state=initial;language=initial.language||'en';draw();})
  .catch(error=>{find('steps').textContent=String(error);});
