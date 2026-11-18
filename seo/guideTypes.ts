export const guideRoutes = {
  'crypto-screener': '/#screener',
  scalping: '/#screener',
  'day-trading': '/#replay',
  hookchart: '/#screener',
  'crypto-patterns': '/#patterns',
  terminal: '/#terminal',
  alerts: '/#screener',
  'market-replay': '/#replay',
  liquidations: '/#screener',
} as const;

export type GuideSlug = keyof typeof guideRoutes;
export type GuideDetailSlug = Exclude<GuideSlug, 'crypto-screener'>;

export interface GuideCopy {
  label: string;
  title: string;
  description: string;
  heading: string;
  lead: string;
  open: string;
  sections: readonly { heading: string; text: string }[];
  related: readonly GuideDetailSlug[];
}

export interface LocalizedGuides {
  languageNavigation: string;
  breadcrumbNavigation: string;
  moreGuides: string;
  screener: string;
  terms: string;
  privacy: string;
  pages: Record<GuideDetailSlug, GuideCopy>;
}
