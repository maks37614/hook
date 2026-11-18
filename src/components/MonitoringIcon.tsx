import React from 'react';

/**
 * Monitoring header emblem.
 *
 * Native, resolution-independent vector based on the approved neon
 * laptop/candlesticks/24-7 clock concept. Deliberately self-contained:
 * no PNG mask, external font, animation or network request.
 */
export const MonitoringIcon: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({
  className = '',
  style,
  ...props
}) => {
  const uid = React.useId();
  const rim = `${uid}-rim`;
  const screen = `${uid}-screen`;
  const glass = `${uid}-glass`;
  const halo = `${uid}-halo`;
  const base = `${uid}-base`;

  return (
    <span
      {...props}
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={style}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={rim} x1="8" y1="29" x2="82" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="#80EEFF" />
            <stop offset=".38" stopColor="#18BFFF" />
            <stop offset="1" stopColor="#407DFF" />
          </linearGradient>
          <linearGradient id={screen} x1="45" y1="39" x2="45" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#142A4E" />
            <stop offset="1" stopColor="#030A19" />
          </linearGradient>
          <linearGradient id={glass} x1="10" y1="86" x2="87" y2="94" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1A5797" />
            <stop offset=".48" stopColor="#58CBFF" />
            <stop offset="1" stopColor="#183B74" />
          </linearGradient>
          <linearGradient id={base} x1="19" y1="24" x2="51" y2="41" gradientUnits="userSpaceOnUse">
            <stop stopColor="#234F8F" />
            <stop offset="1" stopColor="#05162D" />
          </linearGradient>
          <filter id={halo} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {/* Radiant always-on clock behind the laptop. */}
        <circle cx="73" cy="25" r="20" stroke="#00DFFF" strokeWidth="4" strokeOpacity=".38" filter={`url(#${halo})`} />
        <circle cx="73" cy="25" r="18.5" fill="#07213C" stroke="#1CEBFF" strokeWidth="2.5" />
        <path d="M73 12v3M86 25h-3M73 38v-3M60 25h3" stroke="#69EFFF" strokeWidth="2" strokeLinecap="round" />
        <path d="M73 16v10l7 4" stroke="#9EFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="73" cy="25" r="2.1" fill="#7EFBFF" />

        {/* Screen glow and crisp laptop bezel. */}
        <rect x="8" y="36" width="76" height="49" rx="6" fill="#08CFFF" fillOpacity=".36" filter={`url(#${halo})`} />
        <rect x="10" y="35" width="73" height="49" rx="5.5" fill="#06172C" stroke={`url(#${rim})`} strokeWidth="2.5" />
        <rect x="14" y="39" width="65" height="40" rx="2" fill={`url(#${screen})`} />
        <path d="M15 50H78M15 61H78M15 72H78" stroke="#326285" strokeWidth=".65" strokeOpacity=".34" />
        <path d="M28 40V78M43 40V78M58 40V78" stroke="#326285" strokeWidth=".6" strokeOpacity=".28" />

        {/* 24/7 pill remains legible as a vector even on Retina mobile screens. */}
        <rect x="18" y="26" width="40" height="16.5" rx="4" fill="#061E38" stroke="#5ADFFF" strokeWidth="1.7" />
        <rect x="20.5" y="28.5" width="35" height="11.5" rx="2.5" fill={`url(#${base})`} />
        <text x="38" y="37.4" textAnchor="middle" fontFamily="Arial, system-ui, sans-serif" fontSize="11" fontWeight="800" letterSpacing=".45" fill="#EAFCFF">24/7</text>

        {/* Five independently drawn market candlesticks. */}
        <g strokeLinecap="round">
          <path d="M24 53v16" stroke="#36F2BA" strokeWidth="1.5" />
          <rect x="21.4" y="57" width="5.2" height="8.5" rx=".8" fill="#39DEAF" />
          <path d="M33 48v19" stroke="#2CEEB7" strokeWidth="1.5" />
          <rect x="30.4" y="51" width="5.2" height="11" rx=".8" fill="#2FE1AA" />
          <path d="M42 45v16" stroke="#43F9C0" strokeWidth="1.5" />
          <rect x="39.4" y="48.5" width="5.2" height="7.5" rx=".8" fill="#50EFC1" />
          <path d="M51 46v17" stroke="#FB6478" strokeWidth="1.5" />
          <rect x="48.4" y="51" width="5.2" height="7.5" rx=".8" fill="#F15D76" />
          <path d="M60 51v16" stroke="#FA7286" strokeWidth="1.5" />
          <rect x="57.4" y="54" width="5.2" height="7" rx=".8" fill="#F26F80" />
          <path d="M69 47v16" stroke="#39F6B8" strokeWidth="1.5" />
          <rect x="66.4" y="50" width="5.2" height="9" rx=".8" fill="#48ECC3" />
        </g>

        {/* Cyan market activity trace below the candles. */}
        <path d="M20 73.5H37l3.5-3.5 3.5 6.1 4.2-9.8 4.2 7.4 3-3.7 3.2 3.5H74" stroke="#04F2FF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 77H72" stroke="#13E5F4" strokeWidth=".6" strokeOpacity=".28" />

        {/* Laptop ledge, luminous base and center trackpad. */}
        <path d="M11 85H83l6.5 6.5c.7 1-.3 2-2 2H7.5c-1.7 0-2.7-1-2-2Z" fill={`url(#${glass})`} stroke="#61D7FF" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 91h78" stroke="#BBF5FF" strokeWidth="1" strokeOpacity=".7" strokeLinecap="round" />
        <path d="M39 85h17l2.5 4h-22Z" fill="#052743" stroke="#39CFFF" strokeWidth=".8" />
        <path d="M41 88h14" stroke="#25F3FF" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </span>
  );
};

type MonitoringMenuIconProps = React.SVGProps<SVGSVGElement> & {
  active?: boolean;
  /** Brighter strokes for small Screener action icons; other usages keep the original palette. */
  vibrant?: boolean;
};

export const MonitoringMenuIcon: React.FC<MonitoringMenuIconProps> = ({ active = false, vibrant = false, ...props }) => {
  const gradientId = React.useId();

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${gradientId})`}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
          <stop stopColor={vibrant ? (active ? '#F0ABFC' : '#E879F9') : (active ? '#E9D8FF' : '#CCB7F9')} />
          <stop offset="50%" stopColor={vibrant ? (active ? '#67E8F9' : '#22D3EE') : (active ? '#A6E8FF' : '#8DD9F8')} />
          <stop offset="100%" stopColor={vibrant ? (active ? '#5EEAD4' : '#34D399') : (active ? '#8AF4E4' : '#6CDBD5')} />
        </linearGradient>
      </defs>
      <path d="M12 8H3a1 1 0 0 0-1 1v10h17v-6" />
      <path d="M1.5 19h19v1.5A1.5 1.5 0 0 1 19 22H3a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="m5 14 2-3 2.5 5 2-3H15" />
      <circle cx="18" cy="6" r="4.5" />
      <path d="M18 3.5V6l2 1" />
    </svg>
  );
};
