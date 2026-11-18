import React from 'react';
import { AlertCircle } from 'lucide-react';

// Shared presentation only: never changes source status, exchange polling,
// automatic preset safety checks, or whether an analysis is considered valid.
type FreshnessKind = 'partial' | 'busy' | 'refresh-failed';

interface Props {
  label: string;
  kind?: FreshnessKind;
  className?: string;
}

export const MarketDataFreshnessIcon: React.FC<Props> = ({
  label, kind = 'partial', className = '',
}) => (
  <span role="img" aria-label={label} title={label}
    data-market-freshness={kind}
    className={`inline-flex shrink-0 items-center align-middle text-slate-400 ${className}`}>
    <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
  </span>
);
