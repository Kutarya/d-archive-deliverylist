import messages from './translations.json';

export const languages = ['en', 'cs', 'tr'] as const;
export type Language = typeof languages[number];
export type MessageKey = keyof typeof messages;
export type LanguageSettings = { interfaceLanguage: Language; outputLanguage: Language };
export const defaultSettings: LanguageSettings = { interfaceLanguage: 'en', outputLanguage: 'en' };
export const locales: Record<Language, string> = { en: 'en-GB', cs: 'cs-CZ', tr: 'tr-TR' };
export const languageNames: Record<Language, string> = { en: 'English', cs: 'Čeština', tr: 'Türkçe' };
export const excelDateFormats: Record<Language, string> = { en: '[$-0809]dd mmm yyyy', cs: 'dd.mm.yyyy', tr: 'dd.mm.yyyy' };
export const isLanguage = (value: unknown): value is Language => languages.includes(value as Language);
export function translate(key: MessageKey, language: Language = 'en', values: Record<string, string | number> = {}): string {
  const template = language === 'en' ? key : messages[key][language];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
export const createTranslator = (language: Language) => (key: MessageKey, values?: Record<string, string | number>) => translate(key, language, values);
export function documentCount(count: number, language: Language = 'en'): string {
  const plural = new Intl.PluralRules(locales[language]).select(count);
  const noun = language === 'tr' ? 'belge' : language === 'cs' ? plural === 'one' ? 'doklad' : plural === 'few' ? 'doklady' : 'dokladů' : plural === 'one' ? 'document' : 'documents';
  return `${new Intl.NumberFormat(locales[language]).format(count)} ${noun}`;
}
export function unitLabel(unit: string, language: Language = 'en'): string {
  if (/^(pcs|pc|adet|ks)$/i.test(unit.trim())) return translate('pcs', language);
  if (/^(box|kutu|krabice)$/i.test(unit.trim())) return translate('box', language);
  return unit;
}
export const dateText = (date: string | Date, language: Language = 'en', utc = false) => new Date(date).toLocaleDateString(locales[language], utc ? {timeZone: 'UTC'} : undefined);
export function localizeError(error: unknown, language: Language): string {
  const text = error instanceof Error ? error.message : String(error);
  for (const [key, translations] of Object.entries(messages)) {
    if (text === key || text === translations.cs || text === translations.tr || text.endsWith('Error: ' + key)) return translate(key as MessageKey, language);
  }
  return translate('Something went wrong. Please try again.', language);
}
