import { MESSAGES } from './messages.js';

export { MESSAGES };
export const LANGS = Object.freeze(['zh-TW', 'en']);
export const STORAGE_KEY = 'crypto-planet:lang';

const isLang = (value) => LANGS.includes(value);

/** 語言優先順序：網址 ?lang= → 上次的選擇 → 瀏覽器語言（任何中文都用繁中）→ 英文 */
export function detectLang({ search = '', stored = null, languages = [] }) {
  const fromQuery = new URLSearchParams(search).get('lang');
  if (isLang(fromQuery)) return fromQuery;
  if (isLang(stored)) return stored;
  return languages.some((l) => l.toLowerCase().startsWith('zh')) ? 'zh-TW' : 'en';
}

/** 回傳 t(key, params)；找不到的鍵回傳鍵名，缺少的參數保留 {name} */
export function createTranslator(lang) {
  const dict = MESSAGES[lang] ?? MESSAGES.en;
  return (key, params = {}) => {
    const template = dict[key];
    if (template === undefined) return key;
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  };
}
