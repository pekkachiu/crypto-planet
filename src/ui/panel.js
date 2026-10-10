import { formatUsd, formatPrice, formatPct, formatCount, buyShare } from './format.js';
import { planetNameKey, planetSubtitleKey } from '../data/planets.js';

const $ = (id) => document.getElementById(id);
const TOAST_MS = 2600;
const TREND_CLASS = { up: 'up', down: 'down', flat: 'flat' };
const LOCALES = { 'zh-TW': 'zh-TW', en: 'en-US' };

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
  let theme = initialTheme;

  $('back').addEventListener('click', onBack);
  $('lang').addEventListener('click', onToggleLang);
  $('theme').addEventListener('click', onToggleTheme);
  $('coin-close').addEventListener('click', onClose);
  $('park-close').addEventListener('click', onClose);
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
    $('park-source').textContent = source === 'okx'
      ? t('park.source', { time: timeText(updatedAt) })
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
  };

  const showCoin = (mapped) => {
    lastCoin = mapped;
    renderCoin();
    $('park-card').hidden = true;
    $('coin-card').hidden = false;
  };

  const showPark = () => {
    renderPark();
    $('coin-card').hidden = true;
    $('park-card').hidden = false;
  };

  /** 星球與店面視角底部的幣種列；手機上比直接點 3D 店面好按 */
  const setCoins = (mappedList, currentId) => {
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
    $('coin-strip').replaceChildren(parkBtn, ...mappedList.map(({ coin, trend }, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.coin = coin.id;
      btn.setAttribute('aria-current', String(coin.id === currentId));
      const change = document.createElement('small');
      change.className = TREND_CLASS[trend];
      change.textContent = formatPct(coin.change24h);
      btn.append(coin.symbol, change);
      btn.addEventListener('click', () => onPickCoin(index));
      return btn;
    }));
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
    setCoins,
    setLanguage,
    hideCards() {
      lastCoin = null;
      $('coin-card').hidden = true;
      $('park-card').hidden = true;
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
