import { describe, it, expect } from 'vitest';
import { MESSAGES, LANGS, detectLang, createTranslator } from '../src/i18n/index.js';

describe('MESSAGES', () => {
  it('中英文的翻譯鍵完全一致，沒有漏翻', () => {
    const zh = Object.keys(MESSAGES['zh-TW']).sort();
    const en = Object.keys(MESSAGES.en).sort();
    expect(en).toEqual(zh);
  });
  it('每個翻譯都是非空字串', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(MESSAGES[lang])) {
        expect(typeof value, `${lang}.${key}`).toBe('string');
        expect(value.length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });
  it('兩種語言使用相同的參數名稱', () => {
    const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(MESSAGES.en)) {
      expect(params(MESSAGES.en[key]), key).toEqual(params(MESSAGES['zh-TW'][key]));
    }
  });
});

describe('detectLang', () => {
  it('網址參數優先', () => {
    expect(detectLang({ search: '?lang=en', stored: 'zh-TW', languages: ['zh-TW'] })).toBe('en');
    expect(detectLang({ search: '?lang=zh-TW', stored: 'en', languages: ['en'] })).toBe('zh-TW');
  });
  it('其次是使用者上次的選擇', () => {
    expect(detectLang({ search: '', stored: 'en', languages: ['zh-TW'] })).toBe('en');
  });
  it('再來看瀏覽器語言：任何中文都用繁中', () => {
    expect(detectLang({ search: '', stored: null, languages: ['zh-HK', 'en'] })).toBe('zh-TW');
    expect(detectLang({ search: '', stored: null, languages: ['zh'] })).toBe('zh-TW');
  });
  it('其他語言一律英文', () => {
    expect(detectLang({ search: '', stored: null, languages: ['ja-JP', 'fr'] })).toBe('en');
    expect(detectLang({ search: '', stored: null, languages: [] })).toBe('en');
  });
  it('無效的參數或儲存值會被忽略', () => {
    expect(detectLang({ search: '?lang=xx', stored: 'klingon', languages: ['zh-TW'] })).toBe('zh-TW');
  });
});

describe('createTranslator', () => {
  it('依語言回傳翻譯並代入參數', () => {
    const t = createTranslator('en');
    expect(t('toast.locked', { planet: 'Meme' })).toBe('Meme is coming soon');
    expect(createTranslator('zh-TW')('toast.locked', { planet: '迷因星' })).toBe('迷因星即將開放');
  });
  it('找不到的鍵回傳鍵名本身，方便發現漏翻', () => {
    expect(createTranslator('en')('nope.missing')).toBe('nope.missing');
  });
  it('缺少的參數保留原樣', () => {
    expect(createTranslator('en')('toast.locked')).toBe('{planet} is coming soon');
  });
});
