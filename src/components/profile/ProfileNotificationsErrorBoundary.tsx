import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';

interface Props { children: React.ReactNode; onClose: () => void }
interface State { failed: boolean }

/** The error boundary is a class, so use a functional fallback to read the current UI language. */
function LocalizedNotificationFallback({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  const { language } = useLanguage();
  const translate = (phrase: string) => translatePhrase(language, phrase);
  return (
    <section role="alert" className="space-y-3 rounded-xl border border-rose-500/40 bg-slate-950 p-5 text-sm text-slate-200">
      <h3 className="font-semibold text-rose-300">{translate('Не вдалося відкрити налаштування сповіщень.')}</h3>
      <p className="text-xs text-slate-400">
        {translate('Можливо, браузер перервав обробку аудіофайлу. Збережені налаштування не видалено.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRetry}
          className="rounded-lg border border-cyan-600 px-3 py-2 text-cyan-300">{translate('Спробувати ще раз')}</button>
        <button type="button" onClick={onClose}
          className="rounded-lg border border-slate-600 px-3 py-2">{translate('Закрити профіль')}</button>
      </div>
    </section>
  );
}

/** Prevent a failed browser audio/IndexedDB interaction from blanking the entire profile modal. */
export class ProfileNotificationsErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error): void {
    console.error('Failed to render profile notification settings:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <LocalizedNotificationFallback
        onRetry={() => this.setState({ failed: false })}
        onClose={this.props.onClose}
      />
    );
  }
}
