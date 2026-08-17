# 探測引擎系統架構 v1

> 一句話：**一個排程器，每小時帶著錢包去市場買菜，把每一次交易全程錄影存證，回來跟官方牌價對答案，算分貼到公佈欄。**
> 品類只做金融行情數據。品類是設定檔（`config/category-finance.ts`），引擎不碰品類邏輯。

---

## 一、元件總覽（7 個，按數據流順序）

```
┌─────────────┐   每日一次
│ 1 目錄同步器 │──── Bazaar discovery API → 篩金融品類 → vendors 表
└─────────────┘
┌─────────────┐   每小時觸發（分鐘數隨機）
│ 2 排程器     │──── 按分層抽樣決定本輪要探測誰
└─────────────┘
┌─────────────┐                    ┌──────────────┐
│ 3 探測器     │── x402 付費呼叫 ──│ 4 真值採集器  │── Binance/OKX/Coinbase
│  (買方錢包)  │    記錄全程時間戳   │              │    公開 API（免費）+ CoinGecko x402（付費）
└─────────────┘                    └──────────────┘
┌─────────────┐
│ 5 存證器     │──── 原始回應 + 標頭 + 付款 tx hash → 逐筆 SHA-256 → 每日 Merkle root 公佈
└─────────────┘
┌─────────────┐
│ 6 計分器     │──── 逐筆指標 → 7 天滾動窗聚合 → 綜合分
└─────────────┘
┌─────────────┐
│ 7 榜單網站   │──── 每小時重新產生；每個 vendor 有詳情頁（誤差歷史圖 + 存證下載）
└─────────────┘
```

## 二、逐元件設計

### 1. 目錄同步器（每日）
- 拉 Bazaar discovery API 全目錄：`GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=100&offset=N`，**免認證**（2026-08-17 實測，全目錄約 14,900 筆）。每筆自帶 `quality.l30DaysTotalCalls`（30 天真實付費呼叫量）與 `l30DaysUniquePayers`——Coinbase 直接告訴你誰有真實流量。另有 search API 可依 `tags`、`maxUsdPrice`、`payTo` 過濾。
- 金融品類篩選三關：關鍵字（price/ohlc/ticker/candle/quote/crypto…）→ 回應 schema 啟發式（有無 price/symbol/timestamp 類欄位）→ **人工確認佇列**（新 vendor 一律人眼看過才轉 active，一天 5 分鐘的事，防垃圾進榜）。
- vendor 生命週期：`candidate → active → dead（連續 7 天探活失敗）→ delisted（從目錄消失）`。payTo 地址變更要記 log（rug 訊號，402audit/fuchss 都在看這個，我們也要看）。

### 2. 排程器 + 抽樣策略（預算控制核心）

分三層，**目標：總探測費壓在 $50–150/月**：

| 層 | 誰 | 頻率 | 假設單價 | 月成本估算 |
|----|----|------|---------|-----------|
| T1 | 榜上主力 ~10 家（依 Bazaar `quality.l30DaysTotalCalls` 真實流量選出） | 每小時 | ~$0.01 | 10×24×30×$0.01 ≈ **$72** |
| T2 | 次要 ~20 家 | 每 4 小時 | ~$0.01 | 20×6×30×$0.01 ≈ **$36** |
| T3 | 長尾/candidate | 每日 1 次探活 | ~$0.01 | ≈ **$10–15** |

硬規則：
- **單 vendor 日花費上限 $0.50**：單價 > $0.05/次的 vendor 自動降頻至符合上限，榜單上標註「低頻監測」。
- **月度斷路器**：累計花費到 $100 發警報、到 $150 停止 T2/T3 只留 T1。錢包裡永遠只放 ≤ $30 USDC（爆錢包的最大損失上限）。
- **探測時間隨機化**：每小時內的觸發分鐘數隨機，避免被賣家識別出探測規律後特殊對待（反作弊 v1）。
- 反作弊 v2（第 2 階段再做）：每月輪換探測錢包地址；每週少量從第二 IP 抽查對照。

### 3. 探測器（x402 買方）
每筆探測記錄：`t_send`（NTP 校時）、`t_recv`、HTTP 狀態、完整原始回應與標頭、鏈上付款 tx hash、本次花費。解析出 `price_reported` 與 `t_claimed`（vendor 自稱的數據時間戳；沒有此欄位本身就要記為缺陷）。
- 標的固定探 BTC/USDT 與 ETH/USDT 兩個（流動性最高、真值最可靠）；vendor 不支援就探它支援的最大市值交易對並標註。
- 逾時 10 秒記為失敗；付款成功但無回應（「收錢不出貨」）是**單獨的最嚴重類別**，獨立欄位記錄。

### 4. 真值採集器
- 免費源：Binance、OKX、Coinbase Exchange 的公開 REST ticker，探測前後各抓一次（±2 秒內），取**三源中位數**為 `p_ref`。單源偏離中位數 > 50 bps 時自動剔除該源並記 log。
- 付費源：CoinGecko x402 端點——它同時是「對照組」與「榜上的品牌賣家」，用 T1 頻率探測。
- 真值本身也走存證流程（同樣蓋時間戳、同樣進 Merkle root），這是方法論可信度的地基。

### 5. 存證器（法律與公信力的地基，規格不可砍）
- 每筆探測的原始回應（含標頭）原封存檔：`{date}/{vendor_id}/{probe_id}.json.gz`。
- 逐筆算 SHA-256 存進 DB；**每日把當天全部雜湊做成 Merkle tree，root 公佈**：
  - v1（第 1 週就要有）：root 每日 commit 到公開 GitHub repo（免費、有第三方時間戳）。
  - v2（第 4 週前）：root 同時發一筆 Base 上的鏈上交易（每天一筆，gas 幾乎為零），榜單頁可驗證。
- 存量估算：每筆回應 ~2KB 壓縮後，月 ~3 萬筆 ≈ 60MB/月，存儲成本忽略不計。

### 6. 計分器

**逐筆指標**：
- `alive`：200 + 可解析 + 含必要欄位 → 1，否則 0
- `latency_ms` = t_recv − t_send
- `err_bps` = |price_reported − p_ref| / p_ref × 10000
- `drift_s` = (t_recv − t_claimed)；t_claimed 缺失記 null

**7 天滾動窗聚合 → 四個子分數（0–100，全部線性、可白話解釋）**：

| 子分數 | 公式 v1 | 白話 |
|--------|---------|------|
| 準確 Acc | max(0, 100 − 2×median_bps − 0.5×p95_bps) | 中位數誤差每 1 bps 扣 2 分；尾部失控另外扣 |
| 存活 Avail | 100 × 成功率 | 一百次叫貨到貨幾次 |
| 新鮮 Fresh | max(0, 100 − 2×median_drift_s)；無時間戳欄位上限 50 分 | 貨標的生產時間 vs 實際到貨差幾秒 |
| 速度 Lat | max(0, 100 − median_ms / 50) | 2.5 秒到貨 = 50 分 |

**綜合分 = 0.35×Acc + 0.25×Avail + 0.20×Fresh + 0.20×Lat**

規則：
- n < 30 筆的 vendor 顯示「數據不足」不排名（統計自保 + 誹謗自保）。
- 「收錢不出貨」任一筆 → 該週綜合分直接壓上限 40 並掛紅旗（這是最嚴重的罪，不能被平均稀釋）。
- 公式帶版本號（v1），改公式 = 發版 + 方法論頁 changelog。**榜單頁永遠同時顯示原始數字**（median bps、成功率、中位延遲、中位漂移），綜合分只用來排序。

### 7. 榜單網站
- 首頁：排名表（綜合分 + 四個原始數字 + 7 天走勢 sparkline + 徽章欄）。
- vendor 詳情頁：誤差歷史圖、延遲分佈、每筆探測可展開看存證（回應雜湊 + 付款 tx 連結）、申訴管道連結。
- 固定頁：方法論（`04-legal.md` 範本）、原始數據下載（每日 CSV dump）、關於。
- 每小時從 DB 重新產生。訪客零登入、零付費——免費公開就是獲客漏斗。

## 三、技術選型（給獨立開發者的務實版）

**推薦：TypeScript 全家桶，兩階段部署**

| 階段 | 跑在哪 | 理由 |
|------|--------|------|
| 第 1 週（Day 1–7 腳本 + 引擎 v0） | 自己的筆電，Node.js 直接跑 | 零部署摩擦，先驗證 x402 SDK 行為 |
| 第 2 週起（引擎 v1 上雲） | **方案 A：Cloudflare Workers**（Cron Triggers 排程 + D1 存 DB + R2 存原始檔 + Pages 出網站），約 $5/月<br>**方案 B：$6/月 VPS**（node-cron + SQLite + Caddy） | A 便宜且免運維，且 **Cloudflare 官方就有 x402 支援文件與範本**（Cloudflare 是 x402 Foundation 共同發起者，`@x402/fetch` + `@x402/evm` 列名支援）——相容風險比原估低。仍保留 Day 7 決定點：第 1 週腳本若在 Workers 有怪症狀就走 B。 |

- 榜單 B（第 2 階段）的 Telegram 監聽需要長連線（MTProto），Workers 跑不了——屆時無論如何加一台最小 VPS 跑監聽器，寫回同一個 DB。
- DB schema（D1/SQLite 通用）：

```sql
CREATE TABLE vendors  (id INTEGER PRIMARY KEY, url TEXT UNIQUE, name TEXT, price_usd REAL,
                       pay_to TEXT, status TEXT, tier INTEGER, first_seen TEXT, notes TEXT);
CREATE TABLE probes   (id INTEGER PRIMARY KEY, vendor_id INTEGER, symbol TEXT,
                       t_send TEXT, t_recv TEXT, latency_ms INTEGER, http_status INTEGER,
                       alive INTEGER, paid_no_goods INTEGER, price_reported REAL,
                       t_claimed TEXT, drift_ms INTEGER, err_bps REAL,
                       raw_hash TEXT, archive_key TEXT, tx_hash TEXT, cost_usd REAL);
CREATE TABLE truth    (id INTEGER PRIMARY KEY, symbol TEXT, source TEXT, price REAL, t_fetch TEXT);
CREATE TABLE scores_daily (vendor_id INTEGER, date TEXT, n INTEGER, avail REAL, med_bps REAL,
                       p95_bps REAL, med_latency REAL, med_drift REAL, composite REAL,
                       PRIMARY KEY (vendor_id, date));
CREATE TABLE merkle_roots (date TEXT PRIMARY KEY, root TEXT, github_commit TEXT, base_tx TEXT);
CREATE TABLE spend_ledger (date TEXT PRIMARY KEY, total_usd REAL);  -- 斷路器看這張表
```

## 四、與 90 天計畫的對齊

| 週 | 引擎里程碑 |
|----|-----------|
| W1 | Day 1 買方腳本跑通（`day1/`）；Day 2–3 賣方 endpoint 上 Bazaar；Day 6–7 引擎 v0 = 目錄同步器 + 全量探活一輪 |
| W2 | 探測器 + 真值採集器 + 存證器 v1（Merkle root 進 GitHub）；上雲決定點執行 |
| W3 | 計分器 + 7 天窗跑滿一輪；內部榜單 dry-run |
| W4 | 榜單網站上線（含方法論頁、免責聲明、申訴信箱）；Merkle root 上鏈 v2 |
| W5 | 抽樣分層調優 + 斷路器實測；反作弊 v1（隨機化）確認生效 |
| W6–7 | 榜單 B：Telegram 監聽器 + 訊號封存 + 結算器（複用存證器與真值採集器） |
| W8 | 從 DB 出報告數據：《State of x402 數據品質報告》 |
| W10+ | 徽章 API + 異常通知（付費功能）：本質上只是計分器加一個 webhook |

## 五、風險與應對

- **x402 SDK 在 Workers 不相容** → Day 7 決定點直接切 VPS，架構其餘不變。
- **金融品類 vendor 太少（< 10 家活的）** → 榜單照上，「整個品類只有 N 家真的在賣貨」本身就是 W2 長文的爆點；同時把 CoinGecko 等品牌源立為標竿行。
- **被賣家識別探測錢包後餵好數據** → 反作弊 v1/v2（隨機化 + 換錢包 + 第二 IP 抽查）；被抓到差別待遇本身就是頭條級內容。
- **探測費超支** → 斷路器 + 錢包只放 $30。
- **ScoutScore 開始做 ground truth** → 每月一次競品檢查（看他們 README/changelog）；我們的護城河是誤差「歷史」，先跑 8 週就是 8 週的不可回溯數據。（2026-08-17 已再查證：他們的 Response Fidelity 仍是 schema 符合度檢查，無任何數值 vs 權威來源比對的跡象——窗口確認還開著。）
- **技術棧注意**：全部用 x402 **v2** 套件（`@x402/*` 2.22.x），不要用已凍結的 v1（`x402-fetch` 1.2.x）；CDP facilitator 已改為每月前 1,000 筆結算免費、之後 $0.001/筆（只影響賣方端，探測買方不受影響）。
