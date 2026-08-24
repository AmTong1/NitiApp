import React, { createContext, useContext } from 'react';
import th from './th';

export type Language = 'th';

type I18nContextType = {
  lang: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextType>({
  lang: 'th',
  t: (key) => key,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = (key: string, params?: Record<string, string | number>): string => {
    let text = th[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
      });
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ lang: 'th', t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
