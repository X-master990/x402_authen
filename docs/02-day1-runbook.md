# Day 1–7 執行手冊（第 0 階段：親手跑通買賣兩端）

> 技術事實全部於 **2026-08-17 實測查證**。最重要的一件事先講：
> **x402 已從 v1 換到 v2。** 協議移交給 x402 Foundation，套件從 `x402-fetch` 換成 `@x402/fetch`（現版 2.22.0），網路代號改成 CAIP-2 格式（Base = `eip155:8453`），付款標頭從 `X-PAYMENT` 改成 `PAYMENT-SIGNATURE`。**網路上大部分教學還在教 v1，照抄會不通。** `day1/` 的腳本已用 v2 寫好。

---

## Day 1：開錢包 → 換 USDC → 第一筆機器付款

### 1. 開探測錢包（5 分鐘）

```bash
cd day1
npm install
npm run new-wallet        # 產生地址 + 私鑰
cp .env.example .env      # 私鑰貼進 .env 的 EVM_PRIVATE_KEY
```

規則：探測專用錢包、永遠只放 ≤ $30 USDC、私鑰另抄一份進密碼管理器。
**不用買 ETH**——x402 的 exact 付款是 EIP-3009 簽名授權，gas 由 facilitator 代付，錢包裡只要 USDC。

### 2. 把 ~20 USDC 弄上 Base（台灣路徑，半天內辦完）

實測確認的路徑（U 是 USDC，網路一定要選 **Base**）：

```
台幣 ──MAX 或 BitoPro──> USDT/USDC ──轉帳──> Binance / OKX / Bybit ──提領 USDC、網路選 Base──> 探測錢包地址
```

- Binance、OKX、Bybit 三家都支援 USDC 走 Base 網路提領，手續費 < $1，約 2 分鐘到帳。
- ⚠️ 未查證項：MAX/BitoPro 能否**直接**提 USDC 上 Base（他們常見只支援 ERC-20/TRC-20）——所以標準路徑是先過一手國際所。Coinbase 對台灣用戶是否可用也未確認，別浪費時間試。
- 提領前先小額測試（$5），確認到帳再提剩下的。到帳查驗：https://basescan.org/address/你的地址 應出現 USDC 餘額。
- Base 上的正牌 USDC 合約（收到假幣時比對用）：`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

### 3. 第一筆付款（一行指令）

```bash
npm run buy
```

預設對象：CoinGecko 官方 x402 端點（實測活著、$0.01/次、收 Base USDC）：
`https://pro-api.coingecko.com/api/v3/x402/simple/price?ids=bitcoin,ethereum&vs_currencies=usd`

成功時你會看到：HTTP 200、BTC/ETH 現價 JSON、**一條 basescan 交易連結**（你的 $0.01 在鏈上的收據）、以及一筆寫進 `day1/log/receipts.jsonl` 的存證（時間戳 + 回應雜湊）。存證習慣從第一筆就開始——這是整個生意的 DNA。

夜市比喻：你走到攤位前伸手拿貨（第一次 GET），老闆說「一份 1 毛」（402 + 收款條件），你簽一張「從我帳戶轉 1 毛給你」的支票（EIP-3009 簽名）再伸手（帶 PAYMENT-SIGNATURE 重試），老闆找櫃檯兌現支票後把貨給你（200 + 鏈上交易編號）。`@x402/fetch` 就是幫你自動掏錢的皮夾。

### 疑難排解

| 症狀 | 原因與解法 |
|------|-----------|
| 拿回 402、沒扣款 | 對方不收 Base（腳本鎖死 `eip155:8453` 防走錯鏈）。換一個目標，或確認對方 accepts |
| insufficient funds 類錯誤 | USDC 沒到帳或提錯網路。上 basescan 查地址餘額 |
| 連續快速付款第二筆失敗 | 生態有回報過類似 SDK 狀態問題（未證實在 2.22.0 仍存在）。隔幾秒重試；探測引擎本來就不會對同一端點連發 |
| 教學文跟你看到的標頭不一樣 | 對方在講 v1（`X-PAYMENT`）。認 `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE` 才是 v2 |

## Day 2–3：開自己的攤（賣方 + 上架 Bazaar）

**先辦 CDP 帳號**（portal.cdp.coinbase.com）拿三把鑰匙：`CDP_API_KEY_ID`、`CDP_API_KEY_SECRET`、`CDP_WALLET_SECRET`。主網收款必須經 **CDP facilitator**（x402.org 的 facilitator 實測只支援測試網）。費用：每月前 1,000 筆結算免費、之後每筆 $0.001（注意：不再是無條件免費）。

最小可賣攤位（官方 quickstart 實測版）：

```bash
npm install express @coinbase/cdp-sdk @x402/core @x402/evm @x402/svm @x402/extensions @x402/express
```

```typescript
import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import express from "express";

const app = express();
const server = await createX402Server({
  environment: "production",   // 先用 "development"（測試網）跑通再切
  routes: {
    "GET /hello-402": { price: "$0.01", description: "Signed timestamp — my first x402 stall" },
  },
});
app.use(paymentMiddlewareFromHTTPServer(server));
app.get("/hello-402", (_req, res) => res.json({ hello: "402", t: new Date().toISOString() }));
app.listen(8402, () => console.log(`收款地址 ${server.payToEvmAddress}`));
```

- **上架 Bazaar 是自動的**：v2 沒有 `discoverable: true` 這種旗標了；只要經 CDP facilitator 結算，`createX402Server` 的每條 route 自動帶 Bazaar 宣告。要放輸入/輸出 schema 用 `@x402/extensions/bazaar` 的 `declareDiscoveryExtension`。
- 部署：Render/Fly/Railway 最小機即可（Cloudflare Workers 也有官方 x402 支援與範本，見 Day 7 決定點）。
- 這個攤位的隱藏價值：它是你的**金絲雀**——親身觀察上架要多久、誰來爬你、誰付錢探測你（ScoutScore 們會來），全都是內容素材。
- 跑通後用自己的買方腳本打自己一筆：`npm run buy -- https://你的網址/hello-402`。**買賣兩端閉環完成，第一篇長文的素材就齊了。**

## Day 4–5：發內容

《從零到收到第一筆機器付款》長文 + 開英文 X 帳號。素材就是 Day 1–3 的截圖與 basescan 連結。題目與模板見 `docs/03-content-calendar.md` W1。

## Day 6–7：引擎 v0（掃全目錄）

```bash
npm run scan
```

Discovery API 免認證（`https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`），目前全目錄約 **14,900 筆**。腳本會篩出金融行情類、輸出 `day1/out/finance-vendors.{json,csv}`，並按 **30 天真實付費呼叫量**（API 的 `quality.l30DaysTotalCalls` 欄位，Coinbase 自己給的）排序——這直接就是 T1/T2/T3 分層的第一版依據，不用自己猜誰重要。

收尾動作：人工過一遍 CSV（標 active/垃圾）、把 Top 名單貼進試算表、對照 `docs/01-architecture.md` 的抽樣預算算出你的實際月燒——**Day 7 同時做上雲決定**（Workers vs VPS；Cloudflare 有官方 x402 文件與範本，風險比原估的低）。

## 本週花費上限

USDC 探測費 < $2（幾百次 $0.01 呼叫也才幾塊錢）＋賣方部署 $0–7/月。刷卡上限之外，最大風險敞口就是錢包裡的 $20。
