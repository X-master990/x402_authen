// Day 6–7：引擎 v0——抓 Bazaar 全目錄，篩出金融行情類，輸出候選 vendor 清單
// 用法：npm run scan
// 免費、免鑰匙：discovery API 不用認證。全目錄約 1.5 萬筆，掃一輪幾分鐘。
import { mkdirSync, writeFileSync } from "node:fs";

const LIST_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // Base USDC（比對用，轉小寫）

const FINANCE_KEYWORDS = [
  "price", "prices", "ticker", "ohlc", "candle", "kline", "quote", "quotes",
  "market data", "market cap", "exchange rate", "token price", "crypto price",
  "orderbook", "order book", "trading pair", "spot price", "coin price", "fx rate",
];

type Item = {
  resource: string; type: string; description?: string; lastUpdated?: string;
  accepts?: { scheme: string; network: string; amount: string; asset: string; payTo: string }[];
  quality?: { l30DaysTotalCalls?: number; l30DaysUniquePayers?: number; lastCalledAt?: string };
  [k: string]: unknown;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 逐頁抓全目錄（頁大小以 API 實際回覆為準，用 items.length 前進）
const all: Item[] = [];
let offset = 0, total = Infinity;
while (offset < total) {
  const res = await fetch(`${LIST_URL}?limit=100&offset=${offset}`);
  if (!res.ok) throw new Error(`discovery API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { items: Item[]; pagination: { total: number } };
  if (!data.items.length) break;
  all.push(...data.items);
  total = data.pagination.total;
  offset += data.items.length;
  if (offset % 1000 < 100) console.log(`…已抓 ${offset}/${total}`);
  await sleep(150);
}
console.log(`\n目錄總數: ${all.length}`);

const usdPrice = (it: Item): number | null => {
  const prices = (it.accepts ?? [])
    .filter((a) => a.asset?.toLowerCase() === USDC_BASE)
    .map((a) => Number(a.amount) / 1e6)
    .filter((n) => Number.isFinite(n));
  return prices.length ? Math.min(...prices) : null;
};

const isFinance = (it: Item): boolean => {
  const hay = `${it.resource} ${it.description ?? ""}`.toLowerCase();
  return FINANCE_KEYWORDS.some((k) => hay.includes(k));
};

const finance = all.filter(isFinance).map((it) => ({
  resource: it.resource,
  description: (it.description ?? "").slice(0, 160),
  price_usd: usdPrice(it),
  networks: [...new Set((it.accepts ?? []).map((a) => a.network))],
  pay_to: it.accepts?.[0]?.payTo ?? null,
  calls_30d: it.quality?.l30DaysTotalCalls ?? 0,
  payers_30d: it.quality?.l30DaysUniquePayers ?? 0,
  last_called: it.quality?.lastCalledAt ?? null,
  last_updated: it.lastUpdated ?? null,
})).sort((a, b) => b.calls_30d - a.calls_30d);

mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
writeFileSync(new URL("../out/finance-vendors.json", import.meta.url), JSON.stringify(finance, null, 2));
const csv = [
  "resource,price_usd,calls_30d,payers_30d,last_called,pay_to,description",
  ...finance.map((v) => [v.resource, v.price_usd, v.calls_30d, v.payers_30d, v.last_called, v.pay_to,
    `"${v.description.replaceAll('"', '""')}"`].join(",")),
].join("\n");
writeFileSync(new URL("../out/finance-vendors.csv", import.meta.url), csv);

const active = finance.filter((v) => v.calls_30d > 0);
console.log(`金融行情類候選: ${finance.length} 筆（其中 30 天內有真實付費呼叫的: ${active.length} 筆）`);
console.log(`已輸出 day1/out/finance-vendors.{json,csv}\n`);
console.log("30 天呼叫量 Top 15（這就是 T1 分層的第一版名單）:");
for (const v of finance.slice(0, 15)) {
  console.log(`  ${String(v.calls_30d).padStart(8)} 次｜$${v.price_usd ?? "?"}｜${v.resource}`);
}
console.log("\n下一步：人工過一遍 finance-vendors.csv，把真的在賣行情數據的標成 active（見 docs/01-architecture.md 目錄同步器）");
