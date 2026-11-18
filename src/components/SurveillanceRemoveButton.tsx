import { useRef, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface SurveillanceRemoveButtonProps {
  id: string;
  symbol: string;
  onRemove: (id: string) => Promise<boolean>;
  onRemoved?: () => void;
}

export function SurveillanceRemoveButton({ id, symbol, onRemove, onRemoved }: SurveillanceRemoveButtonProps) {
  const { t } = useLanguage();
  const pending = useRef(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(false);

  const remove = async () => {
    if (pending.current) return;
    pending.current = true;
    setRemoving(true);
    setError(false);
    try {
      if (await onRemove(id)) onRemoved?.();
      else setError(true);
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setRemoving(false);
    }
  };

  return (
    <div className="flex max-w-full shrink-0 flex-col gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={removing}
        aria-busy={removing}
        aria-label={t('surveillance.ui.removeSymbol', { symbol })}
        title={t('surveillance.ui.removeTitle')}
        className="flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-rose-300 transition-colors hover:bg-rose-500/20 cursor-pointer disabled:cursor-wait disabled:opacity-60"
      >
        {removing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        <span className="text-xs font-semibold">{t(removing ? 'surveillance.ui.removing' : 'surveillance.ui.remove')}</span>
      </button>
      {error && <span role="alert" className="max-w-48 text-[10px] text-rose-300">{t('surveillance.ui.removeFailed')}</span>}
    </div>
  );
}
