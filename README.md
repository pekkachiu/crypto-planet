# 加密星球小鎮（Crypto Planet Town）

把加密貨幣市場畫成一個太陽系：每個分類一顆星球，每個幣種是星球上的一間店。

- **建築等級**：依絕對市值分四級，摩天大樓（≥ $1T）、辦公大樓（≥ $100B）、街邊店舖（≥ $20B）、小攤
- **路人數量**：24 小時成交額
- **門口右側隊伍（綠）**：24 小時主動買入金額（Taker Buy）
- **門口左側隊伍（紅）**：24 小時主動賣出金額
- **叫號速度**：24 小時成交筆數
- **顏色**：綠漲紅跌

目前開放兩顆星球：

- **主流星**：排除穩定幣與包裝幣後，在 Binance 有 USDT 交易對的市值前十大。
- **ETF 星**：美國現貨 BTC、ETH ETF 中資產規模前十大，每檔 ETF 是一間店（見下方）。

迷因、AI、公鏈星球即將開放。

### ETF 星

- **建築等級**：依資產規模（AUM），≥ $50B 摩天大樓、≥ $10B 辦公大樓、≥ $1B 街邊店舖、其他小攤
- **門口右側隊伍（綠）**：單日淨流入；**左側隊伍（紅）**：單日淨流出（只有一邊有人）
- **路人與叫號速度**：成交額
- 資金流是 **T+1 結算**，畫面上的數字是最近一個已結算交易日；還沒結算的顯示「尚未結算」

### 爆倉公園

位在主流星北極。中央紀念碑的紅色段是多單爆倉、綠色段是空單爆倉；長椅上坐的紅衣人是多單爆倉者、綠衣人是空單爆倉者，人數隨金額增減。

> ⚠️ **爆倉公園只使用 OKX 的資料**：OKX 上這十個幣的 USDT 永續合約、過去 24 小時的爆倉總額，**不是全網爆倉**。數字會比 Coinglass 等全網統計小很多。

### 白天與夜晚

右上角可以切換。預設依使用者的當地時間決定（06:00–18:00 為白天），切換後會記住選擇。

## 資料來源

主流星與爆倉公園由瀏覽器直接呼叫公開 API，不需要 API Key。僅供視覺化參考，非投資建議。

- [CoinGecko](https://www.coingecko.com/)：市值、價格、24 小時漲跌（每 60 秒）
- [Binance](https://data-api.binance.vision/)：用 1 小時 K 線加總出 24 小時成交額、主動買入量、成交筆數（每 60 秒）
- [OKX](https://www.okx.com/docs-v5/en/#public-data-rest-api-get-liquidation-orders)：爆倉公園的 24 小時爆倉，僅 OKX 一家（每 5 分鐘）
- [SoSoValue](https://sosovalue.com/)：ETF 星的資金流、資產規模與成交額。這個 API 需要 Key，所以**不是由瀏覽器呼叫**：GitHub Actions 每天兩次用存在 GitHub Secrets 的 Key 抓資料，整理成 `data/etf.json` 跟網站一起部署。網頁只讀這份 JSON，看不到 Key

API 失敗時改用 `src/data/sample.json` 與 `src/data/sample-liquidations.json` 範例資料（用 `node scripts/make-sample.mjs` 更新）。

## 開發

```bash
npm install
npm run dev        # 本機開發
npm test           # 單元測試
npm run coverage   # 單元測試＋覆蓋率（門檻 80%）
npm run e2e        # Playwright 端對端測試（桌機＋手機）
npm run build      # 輸出到 dist/
```

### ETF 資料（需要 SoSoValue API Key）

1. 到 [SoSoValue](https://openapi.sosovalue.com/) 申請免費 API Key（每分鐘 20 次、每月 10 萬次）。
2. 部署用：repo 的 **Settings → Secrets and variables → Actions** 新增 `SOSOVALUE_API_KEY`。
3. 本機測試（選用）：把 `SOSOVALUE_API_KEY=你的Key` 寫進 `.env.local`（已被 `.gitignore` 排除，不會進版本控制），再執行：

   ```bash
   node --env-file=.env.local scripts/fetch-etf.mjs   # 產生 public/data/etf.json
   ```

沒有 `etf.json` 時，ETF 星會維持上鎖，其他功能不受影響。

## 技術

Three.js（WebGL）、Vite、Vitest、Playwright。部署在 GitHub Pages：push 到 main 後由 GitHub Actions 自動測試並部署。

## 結構

```
src/
├── data/     資料抓取、整理、換算成畫面參數（純邏輯，有單元測試）
├── sim/      人潮模擬、球面幾何、亂數（純邏輯，有單元測試）
├── i18n/     中英文翻譯與語言偵測
├── kit/      3D 素材：建築、招牌、方塊小人、地形、公園、路燈
├── scenes/   太陽系、星球小鎮、鏡頭飛行
└── ui/       介面、格式化、日夜模式
```
