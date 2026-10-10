# CLAUDE.md — 加密星球小鎮（crypto-planet）

靜態網站：把加密貨幣市場畫成低多邊形太陽系。每個分類一顆星球，每個幣種是星球上的一間店。沒有後端，瀏覽器直接呼叫公開 API，部署在 GitHub Pages。使用者面向的說明在 README.md，這份只記錄開發時需要知道的事。

## 指令

```bash
npm test            # Vitest 單元測試
npm run coverage    # 單元測試＋覆蓋率（門檻 80%，只統計純邏輯模組，見 vite.config.js）
npm run e2e         # Playwright（桌機＋Pixel 7），會自動 build 並啟動 vite preview
npm run build       # 輸出到 dist/（base: './'，讓 GitHub Pages 子路徑能載入）
node scripts/make-sample.mjs   # 用即時 API 重新產生 src/data/sample*.json
```

- 本機預覽請用 `npx vite preview --port 4173`。有 hook 會擋下指令裡出現「npm run dev」字樣的呼叫，包括寫進檔案內容的 heredoc。
- zsh 裡不要把迴圈變數取名為 `path`，它會覆蓋 `$PATH`，之後所有指令都會找不到。

## 架構

| 目錄 | 內容 | 測試 |
|---|---|---|
| `src/data/` | API 抓取、資料正規化、數值→畫面參數、星球設定、建築分級、OKX 爆倉 | 單元測試 |
| `src/sim/` | 人潮模擬、球面幾何、地形場、雜訊、公園配置、鏡頭弧線路徑、亂數 | 單元測試 |
| `src/i18n/` | 中英翻譯與語言偵測 | 單元測試 |
| `src/kit/` | Three.js 素材：建築、招牌、方塊小人、地形、公園、路燈、材質 | E2E／截圖 |
| `src/scenes/` | 太陽系、星球小鎮、鏡頭飛行 | E2E／截圖 |
| `src/ui/` | DOM 介面；`format.js`、`theme.js` 是純函式 | 部分單元測試 |
| `src/main.js` | 組裝：渲染器、視角狀態機、資料更新、日夜切換 | E2E |

- **視角狀態**：`solar`（太陽系）→ `planet`（星球全景）→ `shop`（店門口或爆倉公園特寫），飛行中為 `flying`。`state.focusKey` 是幣種 id 或 `'park'`。`body[data-view]` 與 `body[data-theme]` 供 E2E 判斷狀態。
- **小鎮佈局**：`townSpots()` 用費氏螺旋把 `TOP_N + 1` 個點撒在整顆星球上。第 0 點（北極）是爆倉公園，其後依市值排名往南排。地形的平坦廣場也用同一組點。
- **店面切面座標**：店在原點、門朝 +z（南），從正面看右邊（+x）排買方、左邊（-x）排賣方。人潮、欄杆、路燈都用 `groundHeight()` 貼著彎曲的球面。

## 產品決定（不要再改或重問）

- **顏色是國際慣例：綠漲紅跌。** 買方、空單爆倉是綠色；賣方、多單爆倉是紅色。顏色代表行情方向，不是倉位方向。
- **前十大的定義**：排除穩定幣與包裝幣後，在 Binance 有 USDT 現貨交易對的市值前十名。Binance 沒上架的幣拿不到主動買賣量，所以不列入。
- **建築用「絕對」市值分級**（`src/data/tiers.js`），以後的迷因星小幣自然就是小攤。
- **爆倉公園只用 OKX 資料，不是全網。** 使用者看過 Coinglass，但它的內部 API 是加密的；拆解加密等於繞過網站保護，所以不採用。付費或要 Key 的方案（Coinglass、Coinalyze）暫不使用。介面上必須保留「僅 OKX、非全網」的標示。
- 即時爆倉隕石做過又拿掉了：主流幣在平靜行情下的即時爆倉太稀疏，畫面上幾乎看不到。
- 日夜模式預設依當地時間（06–18 為白天），使用者切換後記在 localStorage。
- 支援手機。直式螢幕用 `fitFactor()` 把鏡頭拉遠。

## API 注意事項

- **Binance 現貨 K 線**（`data-api.binance.vision`）：一定要帶 `startTime`。已下架的交易對（例如 XMR）不帶的話，會回傳下架前的舊 K 線，被當成今天的資料。
- **Binance 合約 WebSocket**：舊路徑 `wss://fstream.binance.com/ws/` 連得上但完全沒有資料，要用 `/market/ws/`。目前專案沒有使用。
- **OKX 爆倉歷史**（`/api/v5/public/liquidation-orders`）：
  - 必須帶 `uly`，例如 `BTC-USDT`，不能一次查全部。
  - 用 `after=<最舊的 ts>` 往前翻頁。BTC 一頁 100 筆不到 24 小時，要翻好幾頁。
  - `sz` 是張數，金額＝`sz × ctVal × bkPx`，`ctVal` 來自 `/public/instruments`。
  - 單向持倉模式沒有 `posSide`，改看 `side`：`sell` 是多單爆倉，`buy` 是空單爆倉。
  - 個別幣種失敗時加總成功的幣並標記 `partial`；之後的更新失敗時保留上一次的真實資料。
- 用 Python `urllib` 打 OKX 會被擋（403，缺 User-Agent），測試 API 請改用 Node 的 `fetch` 或 curl。

## 慣例

- **TDD**：純邏輯先寫測試再實作。新的翻譯鍵中英文都要加，`tests/i18n.test.js` 會檢查兩邊的鍵與參數是否一致。
- **外部 API 的字串一律用 `textContent` 寫入 DOM**，不使用 `innerHTML`。
- **註解用繁體中文**，跟現有程式碼一致；commit 訊息用英文 conventional commits。
- 人潮模擬為了效能，會在內部就地更新 agent 物件（已在 `crowd.js` 註明）；其他地方維持不可變更新。
- `camera-rig.js` 直接改 OrbitControls 的內部欄位 `_quat`，依賴 `three@0.170.0`。升級 three 時要一併檢查。
- **Bloom 門檻 0.95**：只有 `toneMapped: false` 且亮度大於 1 的自發光物件會泛光。白天會亮的東西用 `nightGlow(color, 白天強度, 夜晚強度)`，白天的強度要低於門檻。
- **E2E 一律攔截外部 API**（見 `e2e/app.spec.js` 的 `offline()`），不依賴網路；用 `dispatchEvent('click')` 點會公轉移動的星球標籤。

## 視覺驗證

改到 3D 畫面時，用 Playwright 搭配 `--use-angle=swiftshader --enable-unsafe-swiftshader` 截圖，桌機（1440×900）和手機（390×844）都要看。曾經發生過的問題：鏡頭穿過星球、Bloom 讓白牆過曝、手機上的小鎮因為距離判斷錯誤被隱藏。

## 待辦

- 迷因、AI、公鏈星球：CoinGecko 有 `/coins/categories` 可以用。
- ETF 星球：Yahoo Finance 有價格和成交量但不允許跨網域請求，也沒有資金流資料。資料來源（SoSoValue／Farside／不做資金流）還沒決定。
- 尚未推上 GitHub。推上去後，要在 Settings → Pages 把來源設成「GitHub Actions」。
