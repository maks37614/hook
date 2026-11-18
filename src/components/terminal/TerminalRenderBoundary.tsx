import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

type Variant = 'chart' | 'workspace';
interface Props {
  children: React.ReactNode;
  variant: Variant;
  /** Only the affected chart is retried when its market or timeframe changes. */
  resetKey?: string;
  onExit?: () => void;
}
interface State { failed: boolean }

const copy = {
  uk: { chart: 'Помилка відображення графіка', workspace: 'Не вдалося відобразити Термінал',
    detail: 'Робочі налаштування та обрані монети не видалено.',
    retry: 'Відновити', exit: 'До скрінера' },
  en: { chart: 'Chart display error', workspace: 'Unable to display Terminal',
    detail: 'Your workspace settings and selected coins have not been deleted.',
    retry: 'Retry', exit: 'Go to Screener' },
  pl: { chart: 'Błąd wyświetlania wykresu', workspace: 'Nie można wyświetlić Terminala',
    detail: 'Ustawienia obszaru roboczego i wybrane monety nie zostały usunięte.',
    retry: 'Przywróć', exit: 'Do skanera' },
  ru: { chart: 'Ошибка отображения графика', workspace: 'Не удалось отобразить Терминал',
    detail: 'Настройки рабочего пространства и выбранные монеты не удалены.',
    retry: 'Восстановить', exit: 'К скринеру' },
} as const;

function RecoveryFallback({ variant, retry, onExit }: { variant: Variant; retry: () => void; onExit?: () => void }) {
  const { language } = useLanguage();
  const tr = copy[language] ?? copy.uk;
  if (variant === 'chart') {
    return (
      <section data-terminal-chart-recovery role="alert"
        className="flex h-full w-full min-h-[180px] flex-col items-center justify-center gap-3 bg-[#090d16] px-3 text-center text-xs text-slate-300">
        <span>{tr.chart}</span>
        <button type="button" onClick={retry}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-cyan-200 hover:bg-cyan-500/20">
          {tr.retry}
        </button>
      </section>
    );
  }
  return (
    <section data-terminal-workspace-recovery role="alert"
      className="fixed inset-0 z-[60] flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#090d16] p-5 text-center text-sm text-slate-200">
      <strong className="font-semibold text-rose-300">{tr.workspace}</strong>
      <p className="max-w-md text-xs text-slate-400">{tr.detail}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={retry}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-cyan-200">{tr.retry}</button>
        {onExit && <button type="button" onClick={onExit}
          className="rounded-lg border border-slate-700 px-3 py-2 text-slate-300">{tr.exit}</button>}
      </div>
    </section>
  );
}

/**
 * Isolate a failing Terminal chart from the rest of the SPA and other charts.
 * One automatic remount handles transient browser/Canvas teardown errors;
 * persistent failures remain recoverable with a button, never a blank screen.
 * Does not touch candles, chart DPR, streams, or persisted workspace data.
 */
export class TerminalRenderBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private autoRetriedKey: string | null = null;

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Terminal render error (' + this.props.variant + '):', error, info.componentStack);
    const key = this.props.resetKey ?? 'terminal';
    if (this.props.variant === 'chart' && this.autoRetriedKey !== key) {
      this.autoRetriedKey = key;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.setState({ failed: false });
      }, 80);
    }
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.resetKey === this.props.resetKey) return;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.autoRetriedKey = null;
    if (this.state.failed) this.setState({ failed: false });
  }

  componentWillUnmount(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.failed) {
      return <RecoveryFallback variant={this.props.variant}
        retry={() => this.setState({ failed: false })} onExit={this.props.onExit} />;
    }
    return this.props.children;
  }
}
