import { test, expect } from '@playwright/test';
import sample from '../src/data/sample.json' with { type: 'json' };

/**
 * 攔截外部 API，讓測試不依賴網路：CoinGecko 回錯誤 → 改用內建範例資料；
 * 爆倉 WebSocket 改接假伺服器，回傳 send() 讓測試主動推送事件。
 */
async function offline(page) {
  await page.route('https://api.coingecko.com/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('https://data-api.binance.vision/**', (route) => route.fulfill({ status: 503, body: '' }));
  const sockets = [];
  await page.routeWebSocket(/fstream\.binance\.com/, (ws) => { sockets.push(ws); });
  return {
    send(pair, side, usd) {
      const payload = { e: 'forceOrder', E: Date.now(), o: { s: pair, S: side === 'long' ? 'SELL' : 'BUY', ap: String(usd), z: '1', p: String(usd), q: '1', T: Date.now() } };
      for (const ws of sockets) ws.send(JSON.stringify(payload));
    },
    get connected() { return sockets.length; },
  };
}

async function openSolar(page) {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar', { timeout: 20_000 });
  await expect(page.locator('#loading')).toHaveClass(/done/);
}

let liq;
test.beforeEach(async ({ page }) => {
  liq = await offline(page);
});

test('API 失敗時顯示範例資料，太陽系五顆星球都有標籤', async ({ page }) => {
  await openSolar(page);
  await expect(page.locator('#status')).toContainText('範例資料');
  for (const id of ['major', 'meme', 'ai', 'layer1', 'etf']) {
    await expect(page.locator(`[data-planet="${id}"]`)).toBeAttached();
  }
});

test('點未開放的星球會顯示即將開放提示', async ({ page }) => {
  await openSolar(page);
  await page.locator('[data-planet="etf"]').dispatchEvent('click');
  await expect(page.locator('#toast')).toContainText('ETF 星即將開放');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'solar');
});

test('太陽系 → 主流星 → 店面 → 返回，三層視角都能切換', async ({ page }) => {
  await openSolar(page);
  await page.locator('[data-planet="major"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  await expect(page.locator('#coin-strip button')).toHaveCount(sample.coins.length);

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

test('爆倉事件：資訊卡累計多空金額，大額爆倉跳出提示', async ({ page }) => {
  await openSolar(page);
  await expect.poll(() => liq.connected).toBeGreaterThan(0);
  await page.locator('[data-planet="major"]').dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'planet', { timeout: 10_000 });
  const btc = sample.coins.find((c) => c.symbol === 'BTC');
  await page.locator(`#coin-strip [data-coin="${btc.id}"]`).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'shop', { timeout: 10_000 });

  liq.send(btc.pair, 'long', 250_000);
  liq.send(btc.pair, 'short', 1_000);
  liq.send('ZZZUSDT', 'long', 5_000);
  await expect(page.locator('#toast')).toContainText('BTC 多單爆倉 $250K');
  await expect(page.locator('#coin-liq-long')).toHaveText('$250K');
  await expect(page.locator('#coin-liq-short')).toHaveText('$1.00K');
});
