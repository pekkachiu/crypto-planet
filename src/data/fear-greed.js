import { fetchJson } from './api.js';

/**
 * 恐懼貪婪星的資料：alternative.me 的加密貨幣恐懼與貪婪指數（Fear & Greed Index）。
 * 免 Key、允許跨網域，瀏覽器直接抓；指數每天 UTC 0 點更新一次。這裡都是純函式。
 */
/** 今天＋往前 30 天，才算得出「一個月前」 */
export const HISTORY_DAYS = 31;
export const FNG_URL = `https://api.alternative.me/fng/?limit=${HISTORY_DAYS}`;
export const FNG_SOURCE = 'alternative.me';
const DAY_SECONDS = 86400;
/** 時間戳記上限（約西元 2096 年），太大的值 toISOString() 會丟錯 */
const MAX_SECONDS = 4e9;
const NEUTRAL = 50;
/** 雨從 45 分以下開始下、太陽從 55 分以上開始亮，中間是多雲 */
const CALM = { rainBelow: 45, sunAbove: 55 };

/** alternative.me 的五級分界（實際資料：≤25、≤46、≤54、≤75、其餘）；分級名稱由我們翻譯，不採用 API 字串 */
const LEVELS = [[25, 'extremeFear'], [46, 'fear'], [54, 'neutral'], [75, 'greed'], [100, 'extremeGreed']];

export function moodLevel(value) {
  return (LEVELS.find(([max]) => value <= max) ?? LEVELS.at(-1))[1];
}

const toDate = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);

/** 單筆資料：分數必須是 0～100 的整數字串或數字、時間戳記必須是合理範圍內的正整數秒 */
function parseRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const value = Number(raw.value);
  const seconds = Number(raw.timestamp);
  if (!/^\d{1,3}$/.test(String(raw.value).trim()) || value > 100) return null;
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds >= MAX_SECONDS) return null;
  const countdown = Number(raw.time_until_update);
  return { value, seconds, countdown: Number.isInteger(countdown) && countdown >= 0 ? countdown : null };
}

export function parseFearGreed(body) {
  if (!Array.isArray(body?.data)) return null;
  const rows = body.data.map(parseRow).filter(Boolean).sort((a, b) => b.seconds - a.seconds);
  const seen = new Set();
  const history = [];
  for (const { value, seconds } of rows) {
    const date = toDate(seconds);
    if (seen.has(date)) continue;
    seen.add(date);
    history.push({ value, date, level: moodLevel(value) });
  }
  if (history.length === 0) return null;
  return {
    source: FNG_SOURCE,
    today: history[0],
    history: history.slice(0, HISTORY_DAYS),
    // 倒數只採用實際被當成今天的那一筆（rows[0]），不讀未驗證的原始資料
    nextUpdateSec: rows[0].countdown,
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** 天氣強度：rain、sun 都是 0～1 */
export function weatherOf(value) {
  const v = Number.isFinite(value) ? value : NEUTRAL;
  return {
    rain: clamp01((CALM.rainBelow - v) / CALM.rainBelow),
    sun: clamp01((v - CALM.sunAbove) / (100 - CALM.sunAbove)),
  };
}

/** 以今天（history[0]）的日期為準，找 N 天前那天的分數 */
export function valueDaysAgo(history, days) {
  if (!history?.length) return null;
  const today = Date.parse(`${history[0].date}T00:00:00Z`) / 1000;
  const date = toDate(today - days * DAY_SECONDS);
  return history.find((h) => h.date === date)?.value ?? null;
}

function signedDiff(diff) {
  if (diff === null) return '—';
  if (diff === 0) return '±0';
  return diff > 0 ? `+${diff}` : String(diff);
}

/** 換成底部店面列與鏡頭共用的格式（跟小鎮店面一樣有 coin.id、coin.symbol、sign） */
export function mapMood(data) {
  const { value, level } = data.today;
  const yesterday = valueDaysAgo(data.history, 1);
  const diff = yesterday === null ? null : value - yesterday;
  const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return {
    coin: { id: 'fng', symbol: 'F&G' },
    value,
    level,
    trend,
    data,
    sign: { rank: 1, symbol: String(value), primary: '', secondary: signedDiff(diff) },
  };
}

/** 抓不到或格式不對時回傳 null，恐懼貪婪星維持上鎖（或保留上一次的資料） */
export async function loadFearGreed({ fetchImpl = fetch } = {}) {
  try {
    const data = parseFearGreed(await fetchJson(FNG_URL, { fetchImpl }));
    if (!data) console.warn('[crypto-planet] 恐懼貪婪指數格式不正確');
    return data;
  } catch (err) {
    console.warn('[crypto-planet] 恐懼貪婪指數讀取失敗', err);
    return null;
  }
}
