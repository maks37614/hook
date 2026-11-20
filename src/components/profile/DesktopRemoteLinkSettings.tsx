import React, { useEffect, useState } from 'react';
import { desktopRemoteLinkEnabled, desktopRemoteLinkStatus, setDesktopRemoteLinkEnabled } from '../../utils/desktopRemoteLink';

type Language = 'uk' | 'en' | 'pl' | 'ru';
const words: Record<Language, {title:string;desc:string;check:string;test:string;online:string;offline:string;error:string}> = {
  uk: {
    title:'Лінковка з планшета через h00k Desktop',
    desc:'Відкривайте монети на цьому пристрої, а MetaScalp перемикатиме стакан і графіки на комп’ютері. h00k Desktop має бути запущений та авторизований у цьому ж акаунті. Заявки не передаються.',
    check:'Надсилати в h00k Desktop замість локального MetaScalp',
    test:'Перевірити h00k Desktop', online:'Desktop підключено. Можна перемикати монети.',
    offline:'Desktop не підключено або лінковку вимкнено на комп’ютері.',
    error:'Не вдалося перевірити з’єднання.',
  },
  en: {
    title:'Tablet linking through h00k Desktop',
    desc:'Select a coin here to switch the MetaScalp order book and linked charts on your computer. h00k Desktop must be running and signed into this account. No orders are sent.',
    check:'Send to h00k Desktop instead of local MetaScalp',
    test:'Check h00k Desktop', online:'Desktop is connected and ready for ticker commands.',
    offline:'Desktop is offline or linking is disabled on the computer.',
    error:'Could not check the connection.',
  },
  pl: {
    title:'Łączenie z tabletu przez h00k Desktop',
    desc:'Wybierz monetę tutaj, a MetaScalp zmieni arkusz zleceń i powiązane wykresy na komputerze. h00k Desktop musi działać i być zalogowany na to samo konto. Zlecenia nie są wysyłane.',
    check:'Wysyłaj do h00k Desktop zamiast lokalnego MetaScalp',
    test:'Sprawdź h00k Desktop', online:'Desktop połączony, gotowy do przełączania monet.',
    offline:'Desktop jest odłączony lub połączenie wyłączono na komputerze.',
    error:'Nie udało się sprawdzić połączenia.',
  },
  ru: {
    title:'Связь с планшета через h00k Desktop',
    desc:'Выберите монету здесь, а MetaScalp переключит стакан и связанные графики на компьютере. h00k Desktop должен быть запущен и авторизован в этом аккаунте. Ордера не передаются.',
    check:'Отправлять в h00k Desktop вместо локального MetaScalp',
    test:'Проверить h00k Desktop', online:'Desktop подключён и готов переключать монеты.',
    offline:'Desktop отключён или связь выключена на компьютере.',
    error:'Не удалось проверить соединение.',
  },
};
export function DesktopRemoteLinkSettings({uid,language}: {uid?:string;language:string}) {
  const tr=words[(language in words ? language : 'uk') as Language];
  const [enabled,setEnabled]=useState(false);
  const [status,setStatus]=useState<'none'|'online'|'offline'|'error'>('none');
  const [testing,setTesting]=useState(false);
  useEffect(()=>{setEnabled(desktopRemoteLinkEnabled(uid));setStatus('none');},[uid]);
  const toggle=(next:boolean)=>{
    if(!uid)return;
    setDesktopRemoteLinkEnabled(uid,next);
    setEnabled(next);setStatus('none');
  };
  const check=async()=>{
    if(testing||!uid)return;
    setTesting(true);
    try {setStatus(await desktopRemoteLinkStatus()?'online':'offline');}
    catch {setStatus('error');}
    finally {setTesting(false);}
  };
  return (
    <section className="space-y-3 rounded-xl border border-cyan-900/50 bg-slate-950/60 p-4">
      <h4 className="text-sm font-semibold text-slate-100">{tr.title}</h4>
      <p className="text-xs leading-relaxed text-slate-400">{tr.desc}</p>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
        <input type="checkbox" className="accent-cyan-500" disabled={!uid} checked={enabled} onChange={e=>toggle(e.target.checked)} />
        {tr.check}
      </label>
      {enabled && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={()=>void check()} disabled={testing}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 disabled:opacity-50">
            {tr.test}
          </button>
          {status!=='none' && <span role="status" className={'text-xs '+(status==='online'?'text-emerald-400':'text-amber-300')}>{tr[status]}</span>}
        </div>
      )}
    </section>
  );
}
