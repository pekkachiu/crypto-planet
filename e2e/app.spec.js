import { test, expect } from '@playwright/test';
import sample from '../src/data/sample.json' with { type: 'json' };

/**
 * 攔截外部 API，讓測試不依賴網路：CoinGecko 回錯誤 → 改用內建範例資料。
 * OKX 回傳固定的爆倉資料：BTC 一筆多單爆倉 0.5 顆（50 張 × 0.01）@ 80,000＝$40K。
 */
async function offline(page) {
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
