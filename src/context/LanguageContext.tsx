import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  normalizeLanguage,
  supportedLanguages,
  translateKey,
  translatePhrase,
  type LocaleParams,
  type SupportedLanguage,
} from '../locales';
import { translateHookChartPhrase } from '../locales/hookchartLanguage';

export type { SupportedLanguage } from '../locales';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, params?: LocaleParams) => string;
}

export const LANGUAGE_STORAGE_KEY = 'crypto_screener_language';

const LanguageContext = createContext<LanguageContextType>({
  language: 'uk',
  setLanguage: () => {},
  t: (key) => key,
});

const textSources = new WeakMap<Text, { source: string; translated: string }>();
const attributeSources = new WeakMap<Element, Map<string, { source: string; translated: string }>>();

function translateForElement(element: Element, language: SupportedLanguage, source: string) {
  const chart = element.closest('[data-hookchart-language]');
  return chart
    ? translateHookChartPhrase(normalizeLanguage(chart.getAttribute('data-hookchart-language')), source)
    : translatePhrase(language, source);
}

function translateTextNode(node: Text, language: SupportedLanguage) {
  const parent = node.parentElement;
  if (!parent || parent.closest('[data-no-translate], script, style, noscript, code, pre')) return;
  const value = node.nodeValue || '';
  const previous = textSources.get(node);
  const source = previous?.translated === value ? previous.source : value;
  const translated = translateForElement(parent, language, source);
  textSources.set(node, { source, translated });
  if (translated !== value) node.nodeValue = translated;
}

function translateDom(root: ParentNode, language: SupportedLanguage) {
  const translateElement = (element: Element) => {
    if (element.closest('[data-no-translate]')) return;
    const sources = attributeSources.get(element) || new Map();
    for (const attribute of ['title', 'placeholder', 'aria-label', 'aria-description']) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const previous = sources.get(attribute);
      const source = previous?.translated === value ? previous.source : value;
      const translated = translateForElement(element, language, source);
      sources.set(attribute, { source, translated });
      if (translated !== value) element.setAttribute(attribute, translated);
    }
    attributeSources.set(element, sources);
  };

  if (root instanceof Element) translateElement(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, language);
    else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node as Element);
    node = walker.nextNode();
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window === 'undefined') return 'uk';
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  });

  const setLanguage = (lang: SupportedLanguage) => {
    const normalized = normalizeLanguage(lang);
    setLanguageState(normalized);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    }
  };

  const t = (key: string, params?: LocaleParams): string => translateKey(language, key, params);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;

    const root = document.body;
    if (!root) return;

    translateDom(root, language);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          translateTextNode(mutation.target as Text, language);
          continue;
        }

        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          translateDom(mutation.target, language);
          continue;
        }

        for (const added of Array.from(mutation.addedNodes)) {
          if (added.nodeType === Node.TEXT_NODE) {
            translateTextNode(added as Text, language);
          } else if (added instanceof Element) {
            translateDom(added, language);
          }
        }
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'placeholder', 'aria-label', 'aria-description', 'data-hookchart-language'],
    });

    return () => observer.disconnect();
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY) {
        setLanguageState(normalizeLanguage(event.newValue));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

export { supportedLanguages };
