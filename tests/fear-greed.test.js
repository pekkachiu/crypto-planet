import { describe, it, expect, vi } from 'vitest';
import {
  moodLevel, parseFearGreed, weatherOf, valueDaysAgo, mapMood, loadFearGreed, FNG_URL, HISTORY_DAYS,
} from '../src/data/fear-greed.js';

const DAY = 86400;
const T0 = 1791763200; // 2026-10-12 00:00 UTC
const row = (value, daysAgo = 0, extra = {}) => ({
  value: String(value), value_classification: 'whatever', timestamp: String(T0 - daysAgo * DAY), ...extra,
});
const payload = (data) => ({ name: 'Fear and Greed Index', data, metadata: { error: null } });

describe('moodLevel', () => {
  it('沿用 alternative.me 的五級分界', () => {
    expect([0, 25, 26, 46, 47, 54, 55, 75, 76, 100].map(moodLevel)).toEqual([
      'extremeFear', 'extremeFear', 'fear', 'fear', 'neutral', 'neutral', 'greed', 'greed', 'extremeGreed', 'extremeGreed',
    ]);
  });
});

describe('parseFearGreed', () => {
  it('整理成今天的分數與由新到舊的歷史，不採用 API 的分級字串', () => {
    const result = parseFearGreed(payload([row(69, 0, { time_until_update: '76034' }), row(61, 1), row(64, 2)]));
    expect(result.today).toEqual({ value: 69, date: '2026-10-12', level: 'greed' });
    expect(result.history.map((h) => h.value)).toEqual([69, 61, 64]);
    expect(result.history[1]).toEqual({ value: 61, date: '2026-10-11', level: 'greed' });
    expect(result.nextUpdateSec).toBe(76034);
  });
  it('API 沒照順序時依日期重新排序', () => {
    const result = parseFearGreed(payload([row(61, 1), row(69, 0)]));
    expect(result.today.value).toBe(69);
  });
  it('丟掉分數不在 0～100、不是整數或日期無效的資料', () => {
    const result = parseFearGreed(payload([
      row(69), row(101, 1), row(-1, 2), row('6.5', 3), row('<img>', 4), row(40, 5, { timestamp: 'x' }), row(30, 6),
    ]));
    expect(result.history.map((h) => h.value)).toEqual([69, 30]);
  });
  it('同一天重複時只留一筆', () => {
    expect(parseFearGreed(payload([row(69), row(70)])).history).toHaveLength(1);
  });
  it(`最多保留 ${HISTORY_DAYS} 天`, () => {
    const many = Array.from({ length: 60 }, (_, i) => row(50, i));
    expect(parseFearGreed(payload(many)).history).toHaveLength(HISTORY_DAYS);
  });
  it('倒數秒數無效時為 null', () => {
    expect(parseFearGreed(payload([row(69, 0, { time_until_update: 'soon' })])).nextUpdateSec).toBeNull();
  });
  it('格式不對或沒有任何有效資料時回傳 null', () => {
    expect(parseFearGreed(null)).toBeNull();
    expect(parseFearGreed({ data: 'oops' })).toBeNull();
    expect(parseFearGreed(payload([row(999)]))).toBeNull();
    expect(parseFearGreed(payload([null, 'x']))).toBeNull();
  });
});

describe('weatherOf', () => {
  it('中性時沒有雨也沒有大太陽', () => {
    expect(weatherOf(50)).toEqual({ rain: 0, sun: 0 });
  });
  it('越恐懼雨越大，越貪婪太陽越亮，都在 0～1', () => {
    expect(weatherOf(0)).toEqual({ rain: 1, sun: 0 });
    expect(weatherOf(100)).toEqual({ rain: 0, sun: 1 });
    expect(weatherOf(20).rain).toBeGreaterThan(weatherOf(40).rain);
    expect(weatherOf(90).sun).toBeGreaterThan(weatherOf(60).sun);
  });
  it('無效分數當成中性', () => {
    expect(weatherOf(NaN)).toEqual({ rain: 0, sun: 0 });
  });
});

describe('valueDaysAgo', () => {
  const history = parseFearGreed(payload([row(69), row(61, 1), row(40, 7), row(20, 30)])).history;
  it('依日期找 N 天前的分數', () => {
    expect(valueDaysAgo(history, 1)).toBe(61);
    expect(valueDaysAgo(history, 7)).toBe(40);
    expect(valueDaysAgo(history, 30)).toBe(20);
  });
  it('那天沒有資料時回傳 null', () => {
    expect(valueDaysAgo(history, 3)).toBeNull();
    expect(valueDaysAgo([], 1)).toBeNull();
  });
});

describe('mapMood', () => {
  it('換成底部列用的格式：分數與跟昨天比的變化', () => {
    const mapped = mapMood(parseFearGreed(payload([row(69), row(61, 1)])));
    expect(mapped).toMatchObject({
      coin: { id: 'fng', symbol: 'F&G' },
      value: 69,
      level: 'greed',
      trend: 'up',
      sign: { symbol: '69', secondary: '+8' },
    });
  });
  it('下跌為 down、沒有昨天資料時為 flat 並顯示 —', () => {
    expect(mapMood(parseFearGreed(payload([row(30), row(45, 1)]))).trend).toBe('down');
    const alone = mapMood(parseFearGreed(payload([row(30)])));
    expect(alone.trend).toBe('flat');
    expect(alone.sign.secondary).toBe('—');
  });
  it('跟昨天一樣時顯示 ±0', () => {
    expect(mapMood(parseFearGreed(payload([row(30), row(30, 1)]))).sign.secondary).toBe('±0');
  });
});

describe('loadFearGreed', () => {
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  it('抓 30 天以上的資料並整理', async () => {
    const fetchImpl = vi.fn(async () => ok(payload([row(69), row(61, 1)])));
    const result = await loadFearGreed({ fetchImpl });
    expect(result.today.value).toBe(69);
    expect(fetchImpl.mock.calls[0][0]).toBe(FNG_URL);
    expect(new URL(FNG_URL).searchParams.get('limit')).toBe(String(HISTORY_DAYS));
  });
  it('HTTP 錯誤、網路錯誤或格式錯誤時回傳 null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadFearGreed({ fetchImpl: async () => ({ ok: false, status: 503 }) })).toBeNull();
    expect(await loadFearGreed({ fetchImpl: async () => { throw new Error('offline'); } })).toBeNull();
    expect(await loadFearGreed({ fetchImpl: async () => ok({ data: [] }) })).toBeNull();
    warn.mockRestore();
  });
});
