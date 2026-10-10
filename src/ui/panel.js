import { formatUsd, formatSignedUsd, formatPrice, formatPct, formatCount, buyShare } from './format.js';
import { planetNameKey, planetSubtitleKey } from '../data/planets.js';

const $ = (id) => document.getElementById(id);
const TOAST_MS = 2600;
const TREND_CLASS = { up: 'up', down: 'down', flat: 'flat' };
const LOCALES = { 'zh-TW': 'zh-TW', en: 'en-US' };
/** 底部圖例：ETF 星的隊伍代表資金流，不是主動買賣 */
const LEGENDS = {
  default: { 'legend-buy': 'legend.buy', 'legend-sell': 'legend.sell', 'legend-walkers': 'legend.walkers' },
  etf: { 'legend-buy': 'legend.etf.buy', 'legend-sell': 'legend.etf.sell', 'legend-walkers': 'legend.etf.walkers' },
};
const CARD_IDS = ['coin-card', 'park-card', 'etf-card'];
/** 資訊卡上最多列出幾檔 ETF 代號 */
const MAX_LISTED_TICKERS = 6;

/**
 * 介面層：只用 textContent 寫入外部 API 的資料，避免 XSS。
 * 切換語言時用記住的最後狀態重畫所有文字。
 */
export function createUI({
  t: initialT, lang: initialLang, theme: initialTheme,
  onBack, onSpeed, onClose, onPickCoin, onPickPark, onToggleLang, onToggleTheme,
}) {
  let t = initialT;
  let lang = initialLang;
  let toastTimer = 0;
  let lastStatus = null;
  let lastView = { mode: 'solar' };
  let lastCoin = null;
  let lastPark = null;
  let lastEtf = null;
  let etfMeta = null;
  let theme = initialTheme;

  $('back').addEventListener('click', onBack);
  $('lang').addEventListener('click', onToggleLang);
  $('theme').addEventListener('click', onToggleTheme);
  $('coin-close').addEventListener('click', onClose);
  $('park-close').addEventListener('click', onClose);
  $('etf-close').addEventListener('click', onClose);
  for (const btn of document.querySelectorAll('[data-speed]')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', b === btn));
      onSpeed(Number(btn.dataset.speed));
    });
  }

  const timeText = (iso) => (iso
    ? new Date(iso).toLocaleTimeString(LOCALES[lang], { hour12: false })
    : '—');

  const renderStatus = () => {
    if (!lastStatus) {
      $('status').textContent = t('status.loading');
      return;
    }
    if (lastView.planet?.id === 'etf' && etfMeta) {
      $('status').textContent = t('status.etf', { date: etfMeta.asOf ?? '—' });
      $('status').title = '';
      return;
    }
    const { result: { source, updatedAt, error }, keptPrevious } = lastStatus;
    const time = timeText(updatedAt);
    if (keptPrevious) $('status').textContent = t('status.stale', { time });
    else if (source === 'live') $('status').textContent = t('status.live', { time });
    else $('status').textContent = t('status.sample');
    $('status').title = error ?? '';
  };

  /** body[data-view] 讓 E2E 測試能判斷目前視角 */
  const renderView = () => {
    const { mode, planet, coin } = lastView;
    // 公園也是「特寫」視角，E2E 與鏡頭邏輯都把它當成 shop
    document.body.dataset.view = mode === 'park' ? 'shop' : mode;
    $('back').hidden = mode === 'solar';
    $('back').textContent = t(mode === 'shop' || mode === 'park' ? 'back.planet' : 'back.solar');
    const planetName = planet ? t(planetNameKey(planet)) : '';
    const subtitle = planet ? t(planetSubtitleKey(planet)) : '';
    const titles = {
      solar: () => t('view.solar'),
      planet: () => t('view.planet', { planet: planetName, subtitle }),
      shop: () => t('view.shop', { planet: planetName, symbol: coin?.symbol ?? '' }),
      park: () => t('view.park', { planet: planetName }),
    };
    $('view-title').textContent = titles[mode]();
    $('coin-strip').hidden = mode === 'solar';
    const legend = LEGENDS[planet?.id] ?? LEGENDS.default;
    for (const [id, key] of Object.entries(legend)) {
      $(id).dataset.i18n = key;
      $(id).textContent = t(key);
    }
  };

  const renderCoin = () => {
    if (!lastCoin) return;
    const { coin, trend, tier } = lastCoin;
    $('coin-rank').textContent = `#${coin.rank}`;
    $('coin-symbol').textContent = coin.symbol;
    $('coin-name').textContent = coin.name;
    $('coin-tier').textContent = t(`tier.${tier}`);
    $('coin-price').textContent = formatPrice(coin.price);
    $('coin-change').textContent = formatPct(coin.change24h);
    $('coin-change').className = TREND_CLASS[trend];
    $('coin-mcap').textContent = formatUsd(coin.marketCap);
    $('coin-volume').textContent = formatUsd(coin.volume24h);
    $('coin-buy').textContent = formatUsd(coin.takerBuy);
    $('coin-sell').textContent = formatUsd(coin.takerSell);
    $('coin-share').textContent = buyShare(coin);
    $('coin-trades').textContent = formatCount(coin.trades);
    $('coin-pair').textContent = t('card.pair', { pair: coin.pair });
  };

  /** ETF 資訊卡（一個幣種所有現貨 ETF 的加總）：資金流是 T+1 結算，還沒結算時顯示「尚未結算」 */
  const renderEtf = () => {
    if (!lastEtf) return;
    const { coin, trend, tier } = lastEtf;
    const more = coin.tickers.length > MAX_LISTED_TICKERS ? '…' : '';
    $('etf-rank').textContent = `#${coin.rank}`;
    $('etf-asset').textContent = t('etf.assetTitle', { asset: coin.asset });
    $('etf-count').textContent = t('etf.count', { n: coin.fundCount ?? coin.tickers.length });
    $('etf-tier').textContent = t(`tier.${tier}`);
    $('etf-tickers').textContent = `${coin.tickers.slice(0, MAX_LISTED_TICKERS).join('・')}${more}`;
    $('etf-inflow').textContent = coin.netInflow === null ? t('etf.unsettled') : formatSignedUsd(coin.netInflow);
    $('etf-inflow').className = TREND_CLASS[trend];
    $('etf-aum').textContent = formatUsd(coin.netAssets);
    $('etf-traded').textContent = formatUsd(coin.valueTraded);
    $('etf-cum').textContent = formatSignedUsd(coin.cumInflow);
    $('etf-source').textContent = t('etf.source', { date: coin.date ?? '—' });
  };

  const renderPark = () => {
    if (!lastPark) {
      for (const id of ['park-total', 'park-long', 'park-short', 'park-share']) $(id).textContent = '…';
      $('park-top').replaceChildren();
      $('park-source').textContent = t('status.loading');
      return;
    }
    const { long, short, byCoin, source, updatedAt } = lastPark;
    const total = long + short;
    $('park-total').textContent = formatUsd(total);
    $('park-long').textContent = formatUsd(long);
    $('park-short').textContent = formatUsd(short);
    $('park-share').textContent = total > 0 ? `${((long / total) * 100).toFixed(1)}%` : '—';
    $('park-top').replaceChildren(...byCoin.slice(0, 5).map((c) => {
      const li = document.createElement('li');
      const longEl = document.createElement('span');
      longEl.className = 'down';
      longEl.textContent = formatUsd(c.long);
      const shortEl = document.createElement('span');
      shortEl.className = 'up';
      shortEl.textContent = formatUsd(c.short);
      li.append(c.symbol, longEl, shortEl);
      return li;
    }));
    const notes = [lastPark.partial && t('park.partial'), lastPark.truncated && t('park.truncated')].filter(Boolean);
    $('park-source').textContent = source === 'okx'
      ? [t('park.source', { time: timeText(updatedAt) }), ...notes].join('・')
      : t('park.sample');
  };

  const renderTheme = () => {
    document.body.dataset.theme = theme;
    $('theme').textContent = theme === 'night' ? '☀️' : '🌙';
    $('theme').setAttribute('aria-label', t(theme === 'night' ? 'theme.toDay' : 'theme.toNight'));
  };

  /** 靜態文字：data-i18n 寫入內文、data-i18n-aria 寫入 aria-label */
  const renderStatic = () => {
    document.documentElement.lang = lang;
    document.title = t('app.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
    $('lang').textContent = t('lang.switch');
    $('lang').setAttribute('aria-label', t('lang.switchLabel'));
  };

  const setStatus = (result, { keptPrevious = false } = {}) => {
    lastStatus = { result, keptPrevious };
    renderStatus();
  };

  const setView = (mode, planet, coin) => {
    lastView = { mode, planet, coin };
    renderView();
    renderStatus();
  };

  const showCard = (id) => {
    for (const card of CARD_IDS) $(card).hidden = card !== id;
  };

  const showCoin = (mapped) => {
    lastCoin = mapped;
    renderCoin();
    showCard('coin-card');
  };

  const showEtf = (mapped) => {
    lastEtf = mapped;
    renderEtf();
    showCard('etf-card');
  };

  const showPark = () => {
    renderPark();
    showCard('park-card');
  };

  /** 星球與店面視角底部的店面列；手機上比直接點 3D 店面好按。park：這顆星球有沒有爆倉公園 */
  const setCoins = (mappedList, currentId, { park = true } = {}) => {
    const parkBtn = document.createElement('button');
    parkBtn.type = 'button';
    parkBtn.className = 'park-btn';
    parkBtn.dataset.park = '';
    parkBtn.setAttribute('aria-current', String(currentId === 'park'));
    const parkLabel = document.createElement('small');
    parkLabel.dataset.i18n = 'park.strip';
    parkLabel.textContent = t('park.strip');
    parkBtn.append('🌳', parkLabel);
    parkBtn.addEventListener('click', onPickPark);
    const shopBtns = mappedList.map(({ coin, trend, sign }, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.coin = coin.id;
      btn.setAttribute('aria-current', String(coin.id === currentId));
      const change = document.createElement('small');
      change.className = TREND_CLASS[trend];
      change.textContent = sign.secondary;
      btn.append(coin.symbol, change);
      btn.addEventListener('click', () => onPickCoin(index));
      return btn;
    });
    $('coin-strip').replaceChildren(...(park ? [parkBtn] : []), ...shopBtns);
  };

  const toast = (message) => {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, TOAST_MS);
  };

  const setLanguage = (nextT, nextLang) => {
    t = nextT;
    lang = nextLang;
    renderStatic();
    renderStatus();
    renderView();
    renderCoin();
    renderEtf();
    renderPark();
    renderTheme();
  };

  renderStatic();
  renderStatus();
  renderTheme();

  return {
    setStatus,
    setView,
    showCoin,
    showEtf,
    setCoins,
    setLanguage,
    hideCards() {
      lastCoin = null;
      lastEtf = null;
      showCard(null);
    },
    /** ETF 資料的日期，在 ETF 星上顯示於左上狀態列 */
    setEtfMeta(meta) {
      etfMeta = meta;
      renderStatus();
    },
    setParkData(liqs) {
      lastPark = liqs;
      renderPark();
    },
    showPark,
    setTheme(next) {
      theme = next;
      renderTheme();
    },
    toast,
    doneLoading() { $('loading').classList.add('done'); },
    failLoading(message) { $('loading').replaceChildren(message); },
  };
}
