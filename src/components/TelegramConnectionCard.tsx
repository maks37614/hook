import React from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Link2, LoaderCircle, RefreshCw, Send, Unlink } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useTelegram } from '../context/TelegramContext';

export const TelegramConnectionCard: React.FC = () => {
  const { t } = useLanguage();
  const { status, loading, busy, linkUrl, errorCode, feedback, connect, disconnect, sendTest, refresh } = useTelegram();
  const connected = Boolean(status?.isConfigured);
  const waiting = Boolean(status?.linkPending && linkUrl);
  const telegramErrorText = (code: string) => {
    const key = `telegram.errors.${code}`;
    const translated = t(key);
    // Unknown server errors must not leak untranslated localization keys.
    return translated === key ? t('telegram.errors.request_failed') : translated;
  };

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 space-y-4" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${connected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-cyan-500/10 text-cyan-300'}`}>
          {connected ? <CheckCircle2 className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white">{t('telegram.title')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {loading ? t('telegram.checking') : connected
              ? `${t('telegram.connected')}${status?.username ? ` · @${status.username}` : ''}`
              : status?.serverConfigured === false ? t('telegram.serverUnavailable') : t('telegram.description')}
          </p>
        </div>
      </div>

      {status?.pollingError && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{telegramErrorText(status.pollingError)}</span>
        </div>
      )}

      {waiting && (
        <div className="space-y-3 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
          <p className="text-xs leading-relaxed text-slate-200">{t('telegram.startInstruction')}</p>
          <a href={linkUrl!} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25">
            <ExternalLink className="h-4 w-4" /> {t('telegram.open')}
          </a>
        </div>
      )}

      {status?.linkPending && !linkUrl && !connected && (
        <p className="flex items-center gap-2 text-xs text-cyan-200">
          <LoaderCircle className="h-4 w-4 animate-spin" /> {t('telegram.linkOnAnotherDevice')}
        </p>
      )}

      {errorCode && (
        <div className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{telegramErrorText(errorCode)}</span>
        </div>
      )}
      {status?.linkError && (
        <div className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{telegramErrorText(status.linkError)}</span>
        </div>
      )}
      {feedback && (
        <p className="text-xs text-emerald-300">{t(feedback === 'queued' ? 'telegram.testQueued' : 'telegram.testSent')}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <button type="button" onClick={() => connect()} disabled={busy !== null || loading || status?.serverConfigured !== true || waiting}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === 'connect' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {busy === 'connect' ? t('telegram.connecting') : status?.linkPending && !linkUrl ? t('telegram.newLink') : waiting ? t('telegram.waiting') : t('telegram.connect')}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => sendTest()} disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
              {busy === 'test' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy === 'test' ? t('telegram.sending') : t('telegram.test')}
            </button>
            <button type="button" onClick={() => disconnect()} disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-50">
              {busy === 'disconnect' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              {busy === 'disconnect' ? t('telegram.disconnecting') : t('telegram.disconnect')}
            </button>
          </>
        )}
        <button type="button" onClick={() => refresh().catch(() => {})} disabled={loading || busy !== null}
          title={t('telegram.refresh')} aria-label={t('telegram.refresh')}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('telegram.refresh')}
        </button>
      </div>
    </section>
  );
};
