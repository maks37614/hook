import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { HookChartPreferences } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import { resolveHookChartLanguage } from '../../locales/hookchartLanguage';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../hookchart/OriginalHookChartSettings';
import { strategyPreferencePatch } from '../hookchart/strategyEngine';
import { publishMaxCanvasDpr } from '../hookchart/canvasDpr';
import { resolveTimeZone } from '../../utils/tradingSessions';
import '../hookchart/integration.css';

function mergeSettings(current: HookChartPreferences, delta: HookChartPreferences): HookChartPreferences {
  return {
    ...current,
    ...delta,
    ...(delta.hotkeys ? { hotkeys: { ...current.hotkeys, ...delta.hotkeys } } : {}),
  };
}

/**
 * A single shared HookChart settings editor. This mounts no chart, websocket or
 * candle fetch; saving the profile makes the values available on every page.
 */
export function ProfileHookChartSettings() {
  const { user, profile, updateProfileData } = useAuth();
  const { language: siteLanguage } = useLanguage();
  const [draft, setDraft] = useState<HookChartPreferences>(() => normalizeOriginalHookChartPreferences(profile?.hookChartPreferences));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const writerRef = useRef(updateProfileData);
  writerRef.current = updateProfileData;
  const uidRef = useRef(user?.uid ?? null);
  uidRef.current = user?.uid ?? null;
  const readyUidRef = useRef(profile?.uid ?? null);
  readyUidRef.current = profile?.uid ?? null;
  const lastUidRef = useRef(user?.uid ?? null);
  const pendingRef = useRef<HookChartPreferences | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writingRef = useRef(0);
  const mountedRef = useRef(true);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const delta = pendingRef.current;
    const uid = uidRef.current;
    if (!delta || !uid || readyUidRef.current !== uid) return;
    pendingRef.current = null;
    writingRef.current += 1;
    if (mountedRef.current) setSaving(true);

    void writerRef.current({ hookChartPreferences: delta })
      .then(() => {
        if (mountedRef.current && uidRef.current === uid) {
          setError(null);
          if (!pendingRef.current && writingRef.current === 1) setSaved(true);
        }
      })
      .catch((reason: unknown) => {
        if (uidRef.current !== uid) return;
        pendingRef.current = mergeSettings(delta, pendingRef.current || {});
        if (mountedRef.current) setError(reason instanceof Error ? reason.message : 'Не вдалося зберегти налаштування графіка');
      })
      .finally(() => {
        writingRef.current = Math.max(0, writingRef.current - 1);
        if (mountedRef.current && uidRef.current === uid && writingRef.current === 0) setSaving(Boolean(timerRef.current));
      });
  }, []);

  // Account boundaries must never carry unsaved chart settings into another user.
  useEffect(() => {
    if (lastUidRef.current === user?.uid) return;
    lastUidRef.current = user?.uid ?? null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    setError(null);
    setSaving(false);
    setSaved(false);
    setDraft(normalizeOriginalHookChartPreferences(profile?.uid === user?.uid ? profile?.hookChartPreferences : undefined));
  }, [user?.uid, profile?.uid]);

  // Read account updates (including changes made in another chart/page), but
  // never replace unsaved local input with an older remote profile snapshot.
  useEffect(() => {
    if (!user?.uid || profile?.uid !== user.uid) return;
    if (pendingRef.current || writingRef.current) return;
    setDraft(normalizeOriginalHookChartPreferences(profile.hookChartPreferences));
  }, [profile?.hookChartPreferences, profile?.uid, user?.uid, saving]);

  useEffect(() => {
    mountedRef.current = true;
    const beforeUnload = () => flush();
    window.addEventListener('pagehide', beforeUnload);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', beforeUnload);
      flush();
    };
  }, [flush]);

  const changeSettings = useCallback((delta: HookChartPreferences) => {
    if (!uidRef.current || readyUidRef.current !== uidRef.current) return;
    const update = delta.language ? { ...delta, siteLanguageAtSelection: siteLanguage } : delta;
    const next = mergeSettings(draftRef.current, update);
    draftRef.current = next;
    setDraft(next);
    if (update.maxCanvasDpr !== undefined) publishMaxCanvasDpr(update.maxCanvasDpr, uidRef.current);
    pendingRef.current = mergeSettings(pendingRef.current || {}, update);
    setSaving(true);
    setSaved(false);
    setError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 500);
  }, [siteLanguage, flush]);

  const applyStrategy = useCallback((id: string) => {
    const patch = strategyPreferencePatch(id);
    if (patch) changeSettings(patch);
  }, [changeSettings]);

  const chartLanguage = resolveHookChartLanguage(draft, siteLanguage);
  if (!user?.uid || profile?.uid !== user.uid) {
    return <div role="status" className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-5 text-sm text-slate-300">
      {translatePhrase(siteLanguage, 'Завантаження персональних налаштувань графіка…')}
    </div>;
  }

  return <section className="hookchart-root profile-hookchart-settings" data-hookchart-language={chartLanguage} lang={chartLanguage} aria-label={translatePhrase(siteLanguage, "Налаштування HookChart у профілі")}>
    {(saving || error || saved) && <div className="mb-3 text-xs" role="status" aria-live="polite">
      <span className={error ? 'text-rose-300' : 'text-cyan-300'}>
        {translatePhrase(siteLanguage, error ? 'Помилка збереження' : saving ? 'Зберігаємо…' : 'Збережено у профілі')}
      </span>
    </div>}
    {error && <button type="button" onClick={flush} className="mb-3 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
      {translatePhrase(siteLanguage, error)}. {translatePhrase(siteLanguage, 'Натисніть, щоб повторити.')}
    </button>}
    <OriginalHookChartSettings
      open
      language={chartLanguage}
      embedded
      prefs={draft}
      onChange={changeSettings}
      onApplyStrategy={applyStrategy}
      saveStatus={error ? 'error' : saving ? 'saving' : saved ? 'saved' : 'idle'}
      previewTimezone={resolveTimeZone(profile.timeZone)}
      previewLongColor={draft.candleLongColor}
      previewShortColor={draft.candleShortColor}
      onClose={() => {}}
    />
  </section>;
}
