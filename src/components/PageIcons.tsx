import React from 'react';
import { Search } from 'lucide-react';

type IconProps = React.SVGProps<SVGSVGElement>;

export const ScreenerIcon: React.FC<IconProps> = (props) => (
  <Search strokeWidth={2.75} aria-hidden="true" {...props} />
);

export const FormationsIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M2.5 3v18.5h17" />
    <path d="M5.5 18.5V13h3v5.5zM10.5 18.5v-9H13M18.5 8h3v3" />
    <path d="m7.3 8.8 2.9-2.6m1.6 0 2.6 2.3m4.1-1 1-2" />
    <circle cx="6.5" cy="9.5" r="1.1" />
    <circle cx="11" cy="5.5" r="1.1" />
    <circle cx="20" cy="4.5" r="1.1" />
    <circle cx="16" cy="14" r="4.6" />
    <circle cx="16" cy="14" r="3" strokeWidth={1.4} />
    <path d="m19.4 17.4 2.6 2.6" strokeWidth={2} />
  </svg>
);

export const TerminalIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="2" />
    <path d="M12 2v20M2 12h20" />
    <path d="m4.5 9 2-3 1.5 1 1.5-2" />
    <path d="m14.5 5 1.5 2.5 1.5-1 2 2.5" />
    <path d="m4.5 19 1.5-1.5 1.5 1 2-3" />
    <path d="m14.5 18 1.5 1 1.5-3 2 1.5" />
  </svg>
);
