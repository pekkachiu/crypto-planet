import { formatUsd, formatPrice, formatPct, formatCount, buyShare } from './format.js';

const $ = (id) => document.getElementById(id);
const TOAST_MS = 2600;
const TREND_CLASS = { up: 'up', down: 'down', flat: 'flat' };

/** 介面層：只用 textContent 寫入外部 API 的資料，避免 XSS */
export function createUI({ onBack, onSpeed, onClose, onPickCoin }) {
  let toastTimer = 0;

  $('back').addEventListener('click', onBack);
  $('coin-close').addEventListener('click', onClose);
  for (const btn of document.querySelectorAll('[data-speed]')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', b === btn));
      onSpeed(Number(btn.dataset.speed));
    });
  }

  const setStatus = ({ source, updatedAt, error }, { keptPrevious = false } = {}) => {
    const time = updatedAt ? new Date(updatedAt).toLocaleTimeString('zh-TW', { hour12: false }) : '—';
    if (keptPrevious) {
      $('status').textContent = `更新失敗，顯示 ${time} 的資料`;
    } else if (source === 'live') {
      $('status').textContent = `即時資料・CoinGecko＋Binance・${time} 更新`;
    } else {
      $('status').textContent = '即時資料暫時無法取得，顯示範例資料';
    }
    $('status').title = error ?? '';
  };

  /** body[data-view] 讓 E2E 測試能判斷目前視角 */
  const setView = (mode, planet, coin) => {
    document.body.dataset.view = mode;
    $('back').hidden = mode === 'solar';
    $('back').textContent = mode === 'shop' ? '← 返回星球' : '← 返回太陽系';
    const titles = {
      solar: '太陽系・點選星球進入',
      planet: `${planet?.name}・${planet?.subtitle}・點店面看詳情`,
      shop: `${planet?.name}・${coin?.symbol} 店門口・拖曳可繞店旋轉`,
    };
    $('view-title').textContent = titles[mode];
    $('coin-strip').hidden = mode === 'solar';
  };

  const showCoin = ({ coin, trend }) => {
    $('coin-rank').textContent = `#${coin.rank}`;
    $('coin-symbol').textContent = coin.symbol;
    $('coin-name').textContent = coin.name;
    $('coin-price').textContent = formatPrice(coin.price);
    $('coin-change').textContent = formatPct(coin.change24h);
    $('coin-change').className = TREND_CLASS[trend];
    $('coin-mcap').textContent = formatUsd(coin.marketCap);
    $('coin-volume').textContent = formatUsd(coin.volume24h);
    $('coin-buy').textContent = formatUsd(coin.takerBuy);
    $('coin-sell').textContent = formatUsd(coin.takerSell);
    $('coin-share').textContent = buyShare(coin);
    $('coin-trades').textContent = formatCount(coin.trades);
    $('coin-pair').textContent = `Binance ${coin.pair}・近 24 小時`;
    $('coin-card').hidden = false;
  };

  /** 星球與店面視角底部的幣種列；手機上比直接點 3D 店面好按 */
  const setCoins = (mappedList, currentId) => {
    const strip = $('coin-strip');
    strip.replaceChildren(...mappedList.map(({ coin, trend }, index) => {
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

  return {
    setStatus,
    setView,
    showCoin,
    setCoins,
    hideCoin() { $('coin-card').hidden = true; },
    toast,
    doneLoading() { $('loading').classList.add('done'); },
    failLoading(message) {
      $('loading').replaceChildren(message);
    },
  };
}
