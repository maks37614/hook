import { useId } from 'react';

const PRESETS = [
  { label: '100к', value: 100_000 },
  { label: '300к', value: 300_000 },
  { label: '500к', value: 500_000 },
  { label: '1м', value: 1_000_000 },
  { label: '5м', value: 5_000_000 },
  { label: '8м', value: 8_000_000 },
];

interface ManualDensityThresholdFieldProps {
  value?: number;
  onChange: (value: number | undefined) => void;
}

export function ManualDensityThresholdField({ value, onChange }: ManualDensityThresholdFieldProps) {
  const inputId = useId();
  const descriptionId = `${inputId}-description`;
  const hasValidAmount = typeof value === 'number' && Number.isFinite(value) && value > 0;

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/70 p-3">
      <label htmlFor={inputId} className="block text-[11px] font-semibold text-slate-200">
        Ручний поріг щільності ($ USDT)
      </label>
      <div className="flex items-center rounded-xl border border-slate-700 bg-slate-950 px-3 transition-colors focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-400/15">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          step="1000"
          min="1"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
          placeholder="Введіть суму"
          aria-describedby={descriptionId}
          className="min-w-0 flex-1 bg-transparent py-3 text-lg font-semibold tabular-nums text-white outline-none placeholder:text-sm placeholder:font-normal placeholder:text-slate-600"
        />
        <span className="ml-3 text-xs font-semibold text-slate-400">USDT</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Готові пороги щільності">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-pressed={value === preset.value}
            title={`${preset.value.toLocaleString('uk-UA')} USDT`}
            onClick={() => onChange(preset.value)}
            className={`min-h-11 rounded-lg border px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer ${
              value === preset.value
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p id={descriptionId} className="text-[10px] leading-relaxed text-slate-400">
        {hasValidAmount
          ? `Показувати щільності від ${value.toLocaleString('uk-UA')} USDT. Виберіть готову суму або введіть свою.`
          : 'Вкажіть додатну суму в USDT або виберіть готовий поріг.'}
      </p>
    </div>
  );
}
