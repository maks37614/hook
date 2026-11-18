import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SupportedLanguage } from '../locales';

const LABELS = {
  uk: {title:'Зберегти торгову ідею',description:'Вкажіть причину входу. Вона збережеться лише з цим записом і відображатиметься в архіві.',label:'Причина входу',placeholder:'Наприклад: ретест рівня, пробій опору, підтвердження обсягу…',cancel:'Скасувати',save:'Зберегти формацію',saving:'Збереження…',invalid:'Вкажіть причину входу (від 1 до 500 символів).'},
  en: {title:'Save trading idea',description:'Add your entry reason. It will belong only to this archive record and appear in the archive.',label:'Entry reason',placeholder:'e.g. Level retest, resistance breakout, volume confirmation…',cancel:'Cancel',save:'Save formation',saving:'Saving…',invalid:'Please enter a reason (1–500 characters).'},
  pl: {title:'Zapisz pomysł transakcyjny',description:'Podaj powód wejścia. Będzie widoczny tylko przy tym wpisie w archiwum.',label:'Powód wejścia',placeholder:'Np. retest poziomu, wybicie oporu, potwierdzenie wolumenu…',cancel:'Anuluj',save:'Zapisz formację',saving:'Zapisywanie…',invalid:'Podaj powód (1–500 znaków).'},
  ru: {title:'Сохранить торговую идею',description:'Укажите причину входа. Она будет отображаться только у этой записи в архиве.',label:'Причина входа',placeholder:'Например: ретест уровня, пробой сопротивления, подтверждение объёма…',cancel:'Отмена',save:'Сохранить формацию',saving:'Сохранение…',invalid:'Укажите причину (1–500 символов).'},
} as const;

export const ARCHIVE_ENTRY_REASON_MAX_LENGTH = 500;

export function ArchiveEntryReasonDialog({
  language, coinLabel, saving, onSave, onCancel,
}: {
  language: SupportedLanguage;
  coinLabel: string;
  saving: boolean;
  onSave: (reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const labels = LABELS[language] || LABELS.uk;
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (saving) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [saving, onCancel]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > ARCHIVE_ENTRY_REASON_MAX_LENGTH) {
      setError(labels.invalid);
      return;
    }
    try {
      setError('');
      await onSave(trimmed);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : labels.invalid);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm"
      onMouseDown={event => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
    <form onSubmit={event => void submit(event)}
      role="dialog" aria-modal="true" aria-labelledby="archive-entry-reason-title"
      className="w-full max-w-lg space-y-4 rounded-2xl border border-purple-500/30 bg-[#101827] p-4 shadow-2xl sm:p-6">
      <div className="space-y-1">
        <h3 id="archive-entry-reason-title" className="text-base font-bold text-white">{labels.title}</h3>
        <p className="text-xs leading-relaxed text-slate-400">{labels.description}</p>
        <p className="font-mono text-xs text-cyan-300" data-no-translate>{coinLabel}</p>
      </div>
      <label className="block space-y-2 text-sm font-medium text-slate-200" htmlFor="archive-entry-reason">
        <span>{labels.label} <span className="text-rose-400">*</span></span>
        <textarea id="archive-entry-reason" autoFocus required maxLength={ARCHIVE_ENTRY_REASON_MAX_LENGTH}
          rows={4} disabled={saving} value={reason}
          onChange={event => { setReason(event.target.value); setError(''); }}
          aria-invalid={!!error} placeholder={labels.placeholder}
          className="w-full min-w-0 resize-y rounded-xl border border-slate-600 bg-slate-900 p-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-purple-400"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-slate-500">{reason.length}/{ARCHIVE_ENTRY_REASON_MAX_LENGTH}</span>
        {error && <span role="alert" className="text-xs text-rose-300">{error}</span>}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          {labels.cancel}
        </button>
        <button type="submit" disabled={saving || !reason.trim()}
          className="rounded-lg border border-purple-500/50 bg-purple-600/25 px-4 py-2 text-sm font-semibold text-purple-100 hover:bg-purple-600/40 disabled:opacity-40">
          {saving ? labels.saving : labels.save}
        </button>
      </div>
    </form>
  </div>, document.body);
}
