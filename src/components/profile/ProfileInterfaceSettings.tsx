
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Monitor, Palette, RotateCcw, Save, Type } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import {
  applySiteAppearance, compilePersonalCss, DEFAULT_SITE_APPEARANCE, ensureSiteFontLoaded, isSafeChartColor,
  normalizeSiteAppearance, SITE_ACCENTS, SITE_CHART_PRESETS, SITE_FONTS,
  SITE_SURFACES, SITE_TEXT_SCALES, MAX_CUSTOM_CSS_LENGTH,
  type SiteAppearance,
} from '../../utils/siteAppearance';

/**
 * Live preview is browser-only. Exactly one small profile PATCH on Save.
 * The preview is reverted on exit, CSS cannot perform network or layout actions.
 */
export const ProfileInterfaceSettings: React.FC = () => {
  const { user, profile, updateProfileData } = useAuth();
  const { language, t } = useLanguage();
  const translate = (value: string) => value.startsWith('Недозволене значення: ')
    ? t('ui.interface.disallowedValue', { property: value.slice('Недозволене значення: '.length) })
    : translatePhrase(language, value);
  const [draft, setDraft] = useState<SiteAppearance>(() => normalizeSiteAppearance(profile?.siteAppearance));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const savedRef = useRef<SiteAppearance>(normalizeSiteAppearance(profile?.siteAppearance));
  const cssResult = useMemo(() => compilePersonalCss(draft.customCss), [draft.customCss]);

  // Load the preview font only while the appearance editor is open.
  useEffect(() => { ensureSiteFontLoaded('inter-light'); }, []);

  useEffect(() => {
    const saved = normalizeSiteAppearance(profile?.siteAppearance);
    savedRef.current = saved;
    setDraft(saved);
    applySiteAppearance(saved);
  }, [
    user?.uid, profile?.siteAppearance?.surface, profile?.siteAppearance?.accent,
    profile?.siteAppearance?.font, profile?.siteAppearance?.textScale,
    profile?.siteAppearance?.chartColor, profile?.siteAppearance?.customCss,
  ]);

  // Unsaved changes never leak into the next navigation or another account.
  useEffect(() => () => { applySiteAppearance(savedRef.current); }, []);

  const choose = (next: SiteAppearance) => {
    if (saving) return;
    setDraft(next);
    setMessage(null);
    if (!compilePersonalCss(next.customCss).error && isSafeChartColor(next.chartColor)) {
      applySiteAppearance(next);
    }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedRef.current);
  const save = async () => {
    if (!user || saving || !dirty || cssResult.error || !isSafeChartColor(draft.chartColor)) return;
    setSaving(true);
    setMessage(null);
    try {
      const valid = normalizeSiteAppearance(draft);
      await updateProfileData({ siteAppearance: valid });
      savedRef.current = valid;
      setMessage({ ok: true, text: 'Оформлення збережено у вашому профілі.' });
    } catch (error) {
      const saved = savedRef.current;
      setDraft(saved);
      applySiteAppearance(saved);
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Не вдалося зберегти оформлення.' });
    } finally {
      setSaving(false);
    }
  };
  /**
   * Reset ONLY the Interface appearance group, including user CSS.
   * Persist immediately, so the defaults survive reload and other devices.
   */
  const resetToDefaults = async () => {
    if (!user || saving) return;
    const defaults: SiteAppearance = { ...DEFAULT_SITE_APPEARANCE };
    const previouslySaved = { ...savedRef.current };
    setMessage(null);
    setDraft(defaults);
    applySiteAppearance(defaults);
    if (JSON.stringify(previouslySaved) === JSON.stringify(defaults)) {
      setMessage({ ok: true, text: 'Налаштування інтерфейсу повернуто до стандартних.' });
      return;
    }
    setSaving(true);
    try {
      await updateProfileData({ siteAppearance: defaults });
      savedRef.current = defaults;
      setMessage({ ok: true, text: 'Налаштування інтерфейсу повернуто до стандартних.' });
    } catch (error) {
      // Never pretend that the reset was saved when PostgreSQL rejected it.
      setDraft(previouslySaved);
      applySiteAppearance(previouslySaved);
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'Не вдалося відновити стандартні налаштування.',
      });
    } finally {
      setSaving(false);
    }
  };
  const paletteButton = (active: boolean) =>
    'flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold transition-colors disabled:opacity-60 ' +
    (active ? 'border-cyan-400 bg-cyan-500/10 text-slate-100' : 'border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500');

  return (
    <div className="space-y-6 text-slate-200" aria-label={translate('Інтерфейс')}>
      <div className="flex items-start gap-3 rounded-xl border border-cyan-500/25 bg-slate-950/70 p-4">
        <Palette className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
        <div>
          <h3 className="text-sm font-bold text-slate-100">{translate('Оформлення сайту')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {translate('Кольори й шрифти змінюються одразу. Щоб зберегти їх для свого акаунта та інших пристроїв, натисніть «Зберегти».')}
          </p>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold text-slate-100">{translate('Фон сайту')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SITE_SURFACES.map(surface => {
            const selected = draft.surface === surface.id;
            return (
              <button key={surface.id} type="button" disabled={saving} aria-pressed={selected}
                onClick={() => choose({ ...draft, surface: surface.id })}
                className={'relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ' +
                  (selected ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-950/60 hover:border-slate-500')}>
                <span className="flex h-10 w-full items-center justify-between rounded-md border border-slate-500/20 px-3"
                  style={{ background: surface.preview }}>
                  <span className="h-2 w-12 rounded-full bg-slate-500/25" />
                  {selected && <Check size={15} className="text-cyan-500" />}
                </span>
                <span className="text-xs font-bold text-slate-100">{translate(surface.label)}</span>
                <span className="text-[11px] leading-snug text-slate-400">{translate(surface.description)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold text-slate-100">{translate('Колір акцентів')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SITE_ACCENTS.map(accent => {
            const selected = draft.accent === accent.id;
            return (
              <button key={accent.id} type="button" disabled={saving} aria-pressed={selected}
                onClick={() => choose({ ...draft, accent: accent.id })} className={paletteButton(selected)}>
                <span className="h-5 w-5 shrink-0 rounded-full border border-slate-500/30"
                  style={{ backgroundColor: accent.preview }} />
                <span className="min-w-0 truncate">{translate(accent.label)}</span>
                {selected && <Check className="ml-auto shrink-0" size={13} />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-100">
          <Type size={16} /> {translate('Шрифт сайту')}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SITE_FONTS.map(font => (
            <button key={font.id} type="button" disabled={saving} aria-pressed={draft.font === font.id}
              onClick={() => choose({ ...draft, font: font.id })} className={paletteButton(draft.font === font.id)}
              style={{ fontFamily: font.css, fontWeight: font.id === 'inter-light' ? 300 : undefined }}>
              <span className={font.id === 'inter-light' ? 'text-base font-light' : 'text-base font-bold'}>Aa Яя</span>
              <span className="truncate">{translate(font.label)}</span>
              {draft.font === font.id && <Check size={14} className="ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold text-slate-100">{translate('Розмір тексту на сайті')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {SITE_TEXT_SCALES.map(scale => (
            <button key={scale} type="button" disabled={saving} aria-pressed={draft.textScale === scale}
              onClick={() => choose({ ...draft, textScale: scale })}
              className={paletteButton(draft.textScale === scale) + ' justify-center'}>
              {Math.round(scale * 100)}%
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          {translate('Розмір впливає на інтерфейс, але не змінює розрахунки та масштаб свічок на графіках.')}
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold text-slate-100">{translate('Колір рамок графіків')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SITE_CHART_PRESETS.map(item => (
            <button key={item.color} type="button" disabled={saving} aria-pressed={draft.chartColor === item.color}
              onClick={() => choose({ ...draft, chartColor: item.color })}
              className={paletteButton(draft.chartColor === item.color) + ' flex-col'}>
              <span className="h-8 w-full rounded-md border border-slate-500/30" style={{ background: item.color }} />
              <span>{translate(item.label)}</span>
            </button>
          ))}
        </div>
        <label className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <span>{translate('Власний колір рамки')}</span>
          <input type="color" disabled={saving} aria-label={translate('Власний колір рамки')} value={draft.chartColor}
            onChange={event => {
              choose({ ...draft, chartColor: event.target.value });
            }}
            className="h-9 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900" />
          <span className="font-mono">{draft.chartColor}</span>
        </label>
        <p className="text-[11px] leading-relaxed text-slate-400">
          {translate('Змінюється лише зовнішня рамка блока. Сам графік, свічки, обсяги та шкала цін залишаються без змін.')}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-100">
          <Code2 size={16} /> {translate('Мій CSS')}
        </legend>
        <p className="text-xs leading-relaxed text-slate-400">
          {translate('CSS застосовується тільки у вашому браузері. Дозволені кольори, розміри тексту, товщина шрифту та заокруглення. Заборонені імпорт, URL, анімації та правила зміни розміщення елементів.')}
        </p>
        <textarea value={draft.customCss} disabled={saving} spellCheck={false} rows={5}
          maxLength={MAX_CUSTOM_CSS_LENGTH} aria-label={translate('Мій CSS')}
          placeholder={'.app-header {\n  background-color: #1a2540;\n  border-color: #446688;\n}\n.rounded-xl { border-radius: 18px; }'}
          onChange={event => { setDraft({ ...draft, customCss: event.target.value }); setMessage(null); }}
          onBlur={() => { if (!cssResult.error) applySiteAppearance(draft); }}
          className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-100 focus:border-cyan-500 focus:outline-none" />
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className={cssResult.error ? 'text-rose-400' : 'text-slate-400'}>
            {cssResult.error ? translate(cssResult.error) : translate('CSS перевірено: безпечний для попереднього перегляду.')}
          </span>
          <span className="shrink-0 font-mono text-slate-400">{draft.customCss.length}/{MAX_CUSTOM_CSS_LENGTH}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={saving || !!cssResult.error}
            onClick={() => applySiteAppearance(draft)}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">
            {translate('Переглянути CSS')}
          </button>
        <button type="button" disabled={saving || !draft.customCss}
          onClick={() => choose({ ...draft, customCss: '' })}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          {translate('Очистити CSS')}
        </button>
        </div>
      </fieldset>

      <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
        <Monitor size={16} className="mt-0.5 shrink-0 text-slate-300" />
        <span>{translate('Оформлення діє на Скрінері, Формаціях, Терміналі, Replay та вікнах сайту. Кольори свічок і торгових сигналів не змінюються.')}</span>
      </div>
      {message && (
        <p role="status" className={'rounded-lg border px-3 py-2 text-xs ' +
          (message.ok ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/40 text-rose-300')}>
          {translate(message.text)}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={saving || !user}
          onClick={() => void resetToDefaults()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-60">
          <RotateCcw size={14} /> {translate('Налаштування за замовчуванням')}
        </button>
        <button type="button" disabled={saving || !dirty || !!cssResult.error} onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
          <Save size={14} /> {saving ? translate('Збереження...') : translate('Зберегти')}
        </button>
      </div>
    </div>
  );
};
