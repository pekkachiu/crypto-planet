import { test, expect } from '@playwright/test';
import sample from '../src/data/sample.json' with { type: 'json' };

/**
 * 攔截外部 API，讓測試不依賴網路：CoinGecko 回錯誤 → 改用內建範例資料。
 * OKX 回傳固定的爆倉資料：BTC 一筆多單爆倉 0.5 顆（50 張 × 0.01）@ 80,000＝$40K。
 */
/** ETF 星的測試資料（一個幣種一棟）：BTC 淨流入、ETH 淨流出、XRP 尚未結算（格式同 scripts/fetch-etf.mjs 的輸出） */
const etfGroup = (asset, netAssets, netInflow, tickers) => ({
  asset, date: '2026-10-09', netInflow, valueTraded: netAssets / 70, netAssets, cumInflow: 1e10, fundCount: tickers.length, tickers,
});
const ETF_FIXTURE = {
  source: 'sosovalue', updatedAt: '2026-10-10T01:30:00.000Z', asOf: '2026-10-09',
  assets: [
    etfGroup('BTC', 1.058e11, 2.11e7, ['IBIT', 'FBTC', 'GBTC', 'BTC', 'ARKB', 'BITB', 'HODL', 'BRRR']),
    etfGroup('ETH', 1.57e10, -5.61e7, ['ETHA', 'ETHE', 'FETH']),
    etfGroup('XRP', 4e8, null, ['XRPZ']),
  ],
};

/** 恐懼貪婪指數的測試資料：今天 15（極度恐懼）、昨天 25、一週前 40、一個月前 72，其他天 30 */
const FNG_T0 = Date.UTC(2026, 9, 12) / 1000;
const FNG_SPECIAL = { 0: 15, 1: 25, 7: 40, 30: 72 };
const FNG_FIXTURE = {
  name: 'Fear and Greed Index',
  data: Array.from({ length: 31 }, (_, i) => ({
    value: String(FNG_SPECIAL[i] ?? 30),
    value_classification: 'Extreme Fear',
    timestamp: String(FNG_T0 - i * 86400),
    ...(i === 0 ? { time_until_update: '36000' } : {}),
  })),
  metadata: { error: null },
};

async function offline(page, { etf = ETF_FIXTURE, fng = FNG_FIXTURE } = {}) {
  // 測試不送訪客統計
  await page.route('https://gc.zgo.at/**', (route) => route.abort());
  await page.route('https://*.goatcounter.com/**', (route) => route.abort());
  await page.route('https://api.alternative.me/**', (route) => (fng ? route.fulfill({ json: fng }) : route.fulfill({ status: 503, body: '' })));
  await page.route('**/data/etf.json', (route) => (etf ? route.fulfill({ json: etf }) : route.fulfill({ status: 404, body: '' })));
  await page.route('https://api.coingecko.com/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('https://data-api.binance.vision/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('https://www.okx.com/api/v5/public/instruments**', (route) => route.fulfill({
    json: { code: '0', data: [{ instId: 'BTC-USDT-SWAP', uly: 'BTC-USDT', ctVal: '0.01', ctValCcy: 'BTC' }] },
  }));
  await page.route('https://www.okx.com/api/v5/public/liquidation-orders**', (route) => {
    const firstPage = !new URL(route.request().url()).searchParams.has('after');
    const details = firstPage ? [{ bkPx: '80000', sz: '50', posSide: 'long', side: 'sell', ts: String(Date.now() - 3600e3) }] : [];
    return route.fulfill({ json: { code: '0', data: [{ details }] } });
  });
}

async function openSolar(page) {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar', { timeout: 20_000 });
  await expect(page.locator('#loading')).toHaveClass(/done/);
}

test.beforeEach(async ({ page }) => {
  await offline(page);
});

test('API 失敗時顯示範例資料，太陽系六顆星球都有標籤', async ({ page }) => {
  await openSolar(page);
  await expect(page.locator('#status')).toContainText('範例資料');
  for (const id of ['major', 'meme', 'ai', 'layer1', 'etf', 'mood']) {
    await expect(page.locator(`[data-planet="${id}"]`)).toBeAttached();
  }
});

test('點未開放的星球會顯示即將開放提示', async ({ page }) => {
  await openSolar(page);
  await page.locator('[data-planet="meme"]').dispatchEvent('click');
  await expect(page.locator('#toast')).toContainText('迷因星即將開放');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar');
});

test('很慢的裝置（每幀延遲 0.7 秒）上，鏡頭飛行依真實時間結束', async ({ page }) => {
  // 模擬沒有 GPU 的 CI 機器或低階手機：飛行不能被每幀時間上限拖慢（原本要 16 幀 × 0.7 秒 ≈ 11 秒）
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => setTimeout(() => raf(cb), 700);
  });
  await openSolar(page);
  await page.locator('[data-planet="major"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 6_000 });
});

test('太陽系 → 主流星 → 店面 → 返回，三層視角都能切換', async ({ page }) => {
  await openSolar(page);
  await page.locator('[data-planet="major"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await expect(page.locator('#coin-strip [data-coin]')).toHaveCount(sample.coins.length);

  const first = sample.coins[0];
  await page.locator(`#coin-strip [data-coin="${first.id}"]`).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'shop', { timeout: 10_000 });
  await expect(page.locator('#coin-card')).toBeVisible();
  await expect(page.locator('#coin-symbol')).toHaveText(first.symbol);
  await expect(page.locator('#back')).toHaveText('← 返回星球');

  await page.locator('#back').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await expect(page.locator('#coin-card')).toBeHidden();

  await page.locator('#back').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar', { timeout: 10_000 });
  await expect(page.locator('#coin-strip')).toBeHidden();
});

test('播放速度按鈕可以切換', async ({ page }) => {
  await openSolar(page);
  await page.locator('[data-speed="10"]').click();
  await expect(page.locator('[data-speed="10"]')).toHaveClass(/active/);
  await expect(page.locator('[data-speed="1"]')).not.toHaveClass(/active/);
});

test('頁面沒有未捕捉的 JavaScript 錯誤，也沒有水平捲動', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSolar(page);
  await page.locator('[data-planet="major"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('部落格連結：右上角連回作者部落格，另開分頁，文字跟著語言切換', async ({ page }) => {
  await openSolar(page);
  const blog = page.locator('#blog');
  await expect(blog).toBeVisible();
  await expect(blog).toHaveText('部落格');
  await expect(blog).toHaveAttribute('href', 'https://pekkachiu.github.io/');
  await expect(blog).toHaveAttribute('target', '_blank');
  await expect(blog).toHaveAttribute('rel', /noopener/);
  await page.locator('#lang').click();
  await expect(blog).toHaveText('Blog');
});

test('中英切換：介面、星球名稱與網址都跟著改，重新整理後仍記得', async ({ page }) => {
  await openSolar(page);
  await expect(page.locator('#brand h1')).toHaveText('加密星球小鎮');
  await page.locator('#lang').click();
  await expect(page.locator('#brand h1')).toHaveText('Crypto Planet Town');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-planet="major"] strong')).toHaveText('Majors');
  await expect(page.locator('#status')).toContainText('sample data');
  expect(new URL(page.url()).searchParams.get('lang')).toBe('en');

  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar', { timeout: 20_000 });
  await expect(page.locator('#brand h1')).toHaveText('Crypto Planet Town');
});

test('英文瀏覽器預設顯示英文，資訊卡顯示建築等級', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await offline(page);
  await openSolar(page);
  await expect(page.locator('#brand h1')).toHaveText('Crypto Planet Town');
  await page.locator('[data-planet="major"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await page.locator(`#coin-strip [data-coin="${sample.coins[0].id}"]`).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'shop', { timeout: 10_000 });
  await expect(page.locator('#coin-tier')).toHaveText('Skyscraper');
  await expect(page.locator('#back')).toHaveText('← Back to planet');
  await context.close();
});

test('爆倉公園：從幣種列進入，資訊卡顯示 OKX 24h 多空金額', async ({ page }) => {
  await openSolar(page);
  await page.locator('[data-planet="major"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await page.locator('#coin-strip [data-park]').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'shop', { timeout: 10_000 });
  await expect(page.locator('#park-card')).toBeVisible();
  await expect(page.locator('#coin-card')).toBeHidden();
  await expect(page.locator('#park-long')).toHaveText('$40.0K');
  await expect(page.locator('#park-short')).toHaveText('$0');
  await expect(page.locator('#park-share')).toHaveText('100.0%');
  await expect(page.locator('#park-top li').first()).toContainText('BTC');
  await expect(page.locator('#park-source')).toContainText('OKX');
  await expect(page.locator('#park-card .scope-note')).toHaveText('⚠ 僅 OKX 交易所資料，非全網爆倉');
  await expect(page.locator('#view-title')).toContainText('爆倉公園');

  await page.locator('#back').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await expect(page.locator('#park-card')).toBeHidden();
});

test('日夜切換：依當地時間預設，切換後記住選擇', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const page = await context.newPage();
  await offline(page);
  await page.clock.setFixedTime(new Date('2026-10-10T14:00:00+08:00'));
  await openSolar(page);
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'day');
  await expect(page.locator('#theme')).toHaveAttribute('aria-label', '切換為夜晚');
  await page.locator('#theme').click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'night');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'night');
  await context.close();
});

test('晚上打開預設是夜晚模式', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const page = await context.newPage();
  await offline(page);
  await page.clock.setFixedTime(new Date('2026-10-10T22:30:00+08:00'));
  await openSolar(page);
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'night');
  await context.close();
});

test('ETF 星：一個幣種一棟，隊伍代表資金流，資訊卡顯示加總的淨流入與資料日期', async ({ page }) => {
  await openSolar(page);
  await page.locator('[data-planet="etf"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await expect(page.locator('#status')).toHaveText('ETF 資料・SoSoValue・2026-10-09');
  await expect(page.locator('#legend-buy')).toHaveText('右側隊伍＝淨流入');
  // ETF 星沒有爆倉公園
  await expect(page.locator('#coin-strip [data-park]')).toHaveCount(0);
  await expect(page.locator('#coin-strip [data-coin]')).toHaveCount(3);
  await expect(page.locator('#coin-strip [data-coin="etf:ETH"] small')).toHaveText('-$56.1M');

  await page.locator('#coin-strip [data-coin="etf:BTC"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'shop', { timeout: 10_000 });
  await expect(page.locator('#etf-card')).toBeVisible();
  await expect(page.locator('#coin-card')).toBeHidden();
  await expect(page.locator('#etf-asset')).toHaveText('BTC 現貨 ETF');
  await expect(page.locator('#etf-count')).toHaveText('8 檔');
  await expect(page.locator('#etf-tickers')).toHaveText('IBIT・FBTC・GBTC・BTC・ARKB・BITB…');
  await expect(page.locator('#etf-inflow')).toHaveText('+$21.1M');
  await expect(page.locator('#etf-inflow')).toHaveClass('up');
  await expect(page.locator('#etf-aum')).toHaveText('$106B');
  await expect(page.locator('#etf-source')).toContainText('2026-10-09');

  await page.locator('#coin-strip [data-coin="etf:XRP"]').click();
  await expect(page.locator('#etf-inflow')).toHaveText('尚未結算', { timeout: 10_000 });

  // 回到太陽系後狀態列與圖例恢復成主流星的內容
  await page.locator('#back').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await page.locator('#back').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar', { timeout: 10_000 });
  await expect(page.locator('#status')).toContainText('範例資料');
  await expect(page.locator('#legend-buy')).toHaveText('右側隊伍＝主動買入');
});

test('ETF 資料讀不到時 ETF 星維持上鎖，主流星照常', async ({ page }) => {
  await offline(page, { etf: null });
  await openSolar(page);
  await page.locator('[data-planet="etf"]').dispatchEvent('click');
  await expect(page.locator('#toast')).toHaveText('ETF 資料暫時無法取得');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar');
  await page.locator('[data-planet="major"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
});

test('ETF 資料被竄改成惡意字串時不會執行，只會被丟掉', async ({ page }) => {
  const [btc, eth] = ETF_FIXTURE.assets;
  const evil = { ...ETF_FIXTURE, assets: [{ ...btc, tickers: ['IBIT', '<img src=x onerror="window.__pwned=1">'] }, { ...eth, asset: '<b>ETH</b>' }] };
  await offline(page, { etf: evil });
  await openSolar(page);
  await page.locator('[data-planet="etf"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await expect(page.locator('#coin-strip [data-coin]')).toHaveCount(1);
  await page.locator('#coin-strip [data-coin="etf:BTC"]').click();
  await expect(page.locator('#etf-tickers')).toHaveText('IBIT');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator('#etf-card img')).toHaveCount(0);
});

test('恐懼貪婪星：儀表與資訊卡顯示今天的分數、過去分數與 30 天走勢，中英切換', async ({ page }) => {
  await openSolar(page);
  await page.locator('[data-planet="mood"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await expect(page.locator('#status')).toHaveText('恐懼貪婪指數・alternative.me・2026-10-12');
  await expect(page.locator('#view-title')).toContainText('點儀表看詳情');
  await expect(page.locator('#legend-sell')).toHaveText('紅＝恐懼・下雨');
  await expect(page.locator('#coin-strip [data-park]')).toHaveCount(0);
  await expect(page.locator('#coin-strip [data-coin]')).toHaveCount(1);
  await expect(page.locator('#coin-strip [data-coin="fng"] small')).toHaveText('-10');

  await page.locator('#coin-strip [data-coin="fng"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'shop', { timeout: 10_000 });
  await expect(page.locator('#mood-card')).toBeVisible();
  await expect(page.locator('#coin-card')).toBeHidden();
  await expect(page.locator('#mood-value')).toHaveText('15');
  await expect(page.locator('#mood-value')).toHaveClass('lv-extremeFear');
  await expect(page.locator('#mood-level')).toHaveText('極度恐懼');
  await expect(page.locator('#mood-yesterday')).toHaveText('25 極度恐懼');
  await expect(page.locator('#mood-week')).toHaveText('40 恐懼');
  await expect(page.locator('#mood-month')).toHaveText('72 貪婪');
  await expect(page.locator('#mood-chart span')).toHaveCount(31);
  await expect(page.locator('#mood-source')).toHaveText('alternative.me・資料日期 2026-10-12・每天更新一次・約 10 小時後更新');

  await page.locator('#lang').click();
  await expect(page.locator('#mood-level')).toHaveText('Extreme Fear');
  await expect(page.locator('#mood-month')).toHaveText('72 Greed');
  await expect(page.locator('#view-title')).toContainText('gauge close-up');

  await page.locator('#mood-close').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await expect(page.locator('#mood-card')).toBeHidden();
});

test('恐懼貪婪指數抓不到時那顆星維持上鎖，其他星球照常', async ({ page }) => {
  await offline(page, { fng: null });
  await openSolar(page);
  await page.locator('[data-planet="mood"]').dispatchEvent('click');
  await expect(page.locator('#toast')).toHaveText('恐懼貪婪指數暫時無法取得');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar');
  await page.locator('[data-planet="etf"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
});

test('恐懼貪婪指數被竄改成惡意字串時不會執行，只會被丟掉', async ({ page }) => {
  const [today, ...rest] = FNG_FIXTURE.data;
  const evil = { ...FNG_FIXTURE, data: [{ ...today, value: '<img src=x onerror="window.__pwned=1">' }, ...rest] };
  await offline(page, { fng: evil });
  await openSolar(page);
  await page.locator('[data-planet="mood"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  // 今天那筆被丟掉，改用最新的有效資料（昨天的 25）
  await expect(page.locator('#status')).toHaveText('恐懼貪婪指數・alternative.me・2026-10-11');
  await page.locator('#coin-strip [data-coin="fng"]').click();
  await expect(page.locator('#mood-value')).toHaveText('25', { timeout: 10_000 });
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator('#mood-card img')).toHaveCount(0);
});

test('在介面面板上用觸控板或手指捏合縮放，不會把整個網頁放大裁切', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', '捏合手勢要用 Chromium 的 CDP 模擬');
  await openSolar(page);
  const cdp = await page.context().newCDPSession(page);
  const source = testInfo.project.name === 'mobile' ? 'touch' : 'mouse';
  const box = await page.locator('#brand').boundingBox();
  await cdp.send('Input.synthesizePinchGesture', {
    x: box.x + box.width / 2, y: box.y + box.height / 2, scaleFactor: 1.6, gestureSourceType: source,
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
});

test('訪客統計用鎖定版本的 GoatCounter，並帶完整性雜湊', async ({ page }) => {
  await openSolar(page);
  const script = page.locator('script[data-goatcounter]');
  await expect(script).toHaveAttribute('data-goatcounter', 'https://crypto-planet.goatcounter.com/count');
  await expect(script).toHaveAttribute('src', 'https://gc.zgo.at/count.v5.js');
  await expect(script).toHaveAttribute('integrity', /^sha384-/);
  await expect(script).toHaveAttribute('crossorigin', 'anonymous');
});
