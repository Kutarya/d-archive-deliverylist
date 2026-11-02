import { createContext, useContext } from 'react';
import { createTranslator, type Language } from './i18n';

export const LanguageContext = createContext<Language>('en');
export const useLanguage = () => useContext(LanguageContext);
export const useTranslation = () => createTranslator(useLanguage());
