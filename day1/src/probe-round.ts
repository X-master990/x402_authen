// 引擎 v0.5：第一輪付費探測——對精選標的各買一次，跟三所中位數對答案
// 用法：npm run probe
// 安全閥：單筆開價 > $0.02 直接跳過不付；只註冊 Base 鏈；全輪預算上限 $0.10
import "dotenv/config";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const MAX_PRICE_USD = 0.02;
const MAX_ROUND_USD = 0.10;

// 第一輪標的（人工從 out/crypto-price-domains.json Top 20 挑出可直接 GET 的）
// sym: 回應中預期的幣價（用來對答案）；null = 只驗交付不對價
const TARGETS: { url: string; sym: "BTC" | "ETH" | null; name: string }[] = [
  { url: "https://pro-api.coingecko.com/api/v3/x402/simple/price?ids=bitcoin&vs_currencies=usd", sym: "BTC", name: "coingecko(對照組)" },
  { url: "https://api.myceliasignal.com/oracle/price/btc/usd", sym: "BTC", name: "myceliasignal" },
  { url: "https://vibesprings.net/api/price/btc-usd", sym: "BTC", name: "vibesprings" },
  { url: "https://crypto.apitoll.cloud/v1/crypto/price", sym: "BTC", name: "apitoll" },
  { url: "https://ozmium.org/v1/prices", sym: "BTC", name: "ozmium" },
  { url: "https://x402.shizu.me/crypto", sym: "BTC", name: "shizu" },
  { url: "https://x402engine.app/api/crypto/price", sym: "BTC", name: "x402engine" },
  { url: "https://kronossignals.com/api/v1/liquidations/btc", sym: null, name: "kronossignals" },
  { url: "https://api.printmoneylab.com/api/v1/kimchi-premium", sym: null, name: "printmoneylab" },
  { url: "https://aeml-x402.zeabur.app/stable/coin", sym: null, name: "aeml" },
  { url: "https://tick.hugen.tokyo/tick/latest", sym: null, name: "hugen-tick" },
];

const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const payFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }],
});

// ---- 真值 v1：計價基準歸一化 ----
// 教訓（2026-08-18）：USDT 交易對與 USD 交易對混著取中位數，會產生 ~10bps 系統性偏差。
// 修正：抓 USDT/USD 匯率，把 USDT 報價換算成 USD 後再取中位數；同時保留 USDT 基準供比對。
const median = (v: number[]) => { v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
async function truth(sym: "BTC" | "ETH"): Promise<{ usd: number; usdt: number } | null> {
  const j = async (u: string) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); return await r.json(); } catch { return null; } };
  const [bn, ok, cb, tether] = await Promise.all([
    j(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`),
    j(`https://www.okx.com/api/v5/market/ticker?instId=${sym}-USDT`),
    j(`https://api.exchange.coinbase.com/products/${sym}-USD/ticker`),
    j(`https://api.exchange.coinbase.com/products/USDT-USD/ticker`),
  ]);
  const inUsdt = [Number(bn?.price), Number(ok?.data?.[0]?.last)].filter((n) => Number.isFinite(n) && n > 0);
  const cbUsd = Number(cb?.price);
  const rate = Number(tether?.price); // 1 USDT 值多少 USD
  if (!inUsdt.length || !Number.isFinite(cbUsd) || !Number.isFinite(rate) || rate <= 0) return null;
  const usdAll = [...inUsdt.map((p) => p * rate), cbUsd];          // 全部換算成 USD 基準
  const usdtAll = [...inUsdt, cbUsd / rate];                        // 全部換算成 USDT 基準
  return { usd: median(usdAll), usdt: median(usdtAll) };
}

// ---- 從任意 JSON 回應裡撈幣價（範圍過濾 + 欄位名啟發式 + 預言機 canonical 字串）----
function extractPrice(x: unknown, sym: "BTC" | "ETH"): number | null {
  const [lo, hi] = sym === "BTC" ? [5000, 1000000] : [100, 100000];
  // 簽名預言機格式，如 "v1|PRICE|BTCUSD|64093.53|USD|…"（myceliasignal 型）
  const canon = JSON.stringify(x ?? "").match(new RegExp(`PRICE\\|${sym}[A-Z]*\\|(\\d+(?:\\.\\d+)?)`));
  if (canon) { const n = Number(canon[1]); if (n >= lo && n <= hi) return n; }
  let best: number | null = null;
  const walk = (v: unknown, key: string) => {
    if (typeof v === "number" || (typeof v === "string" && /^\d+(\.\d+)?$/.test(v))) {
      const n = Number(v);
      if (n >= lo && n <= hi && /price|usd|last|value|close|rate|btc|eth/i.test(key)) best = best ?? n;
    } else if (Array.isArray(v)) v.forEach((e) => walk(e, key));
    else if (v && typeof v === "object") for (const [k, e] of Object.entries(v)) walk(e, k + "." + key);
  };
  walk(x, "");
  return best;
}

// ---- 免費讀開價單（不付款）----
async function offer(url: string): Promise<{ usd: number | null; baseOk: boolean }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const h = r.headers.get("PAYMENT-REQUIRED");
    if (r.status !== 402 || !h) return { usd: null, baseOk: r.status === 402 };
    const d = JSON.parse(Buffer.from(h, "base64").toString());
    const base = (d.accepts ?? []).find((a: any) => a.network === "eip155:8453");
    return { usd: base ? Number(base.amount) / 1e6 : null, baseOk: !!base };
  } catch { return { usd: null, baseOk: false }; }
}

mkdirSync(new URL("../log/", import.meta.url), { recursive: true });
let spent = 0;
const rows: string[] = [];
console.log(`探測錢包: ${account.address}｜單筆上限 $${MAX_PRICE_USD}｜全輪上限 $${MAX_ROUND_USD}\n`);

for (const t of TARGETS) {
  const o = await offer(t.url);
  if (o.usd === null || !o.baseOk) { rows.push(`⚪ ${t.name}: 讀不到 Base 開價單（可能不收 Base / 非 402 / 掛了）`); continue; }
  if (o.usd > MAX_PRICE_USD) { rows.push(`⚪ ${t.name}: 開價 $${o.usd} 超過單筆上限，跳過`); continue; }
  if (spent + o.usd > MAX_ROUND_USD) { rows.push(`⛔ 預算斷路器：已花 $${spent.toFixed(3)}，停止`); break; }

  const ref = t.sym ? await truth(t.sym) : null;
  const tSend = new Date().toISOString();
  const t0 = performance.now();
  let status = 0, raw = "", tx: string | null = null;
  try {
    const r = await payFetch(t.url, { method: "GET", signal: AbortSignal.timeout(20000) });
    raw = await r.text(); status = r.status;
    const ph = r.headers.get("PAYMENT-RESPONSE");
    if (ph) tx = (decodePaymentResponseHeader(ph) as any)?.transaction ?? null;
  } catch (e) { raw = String(e); }
  const ms = Math.round(performance.now() - t0);
  if (tx) spent += o.usd;

  let verdict: string;
  let bps: number | null = null;
  if (!tx && status !== 200) verdict = "❌ 死攤（付不了款或無回應）";
  else if (tx && status !== 200) verdict = "🚩 收錢不出貨";
  else if (t.sym) {
    const p = extractPrice((() => { try { return JSON.parse(raw); } catch { return null; } })(), t.sym);
    if (p === null) verdict = "🟡 有出貨但撈不到價格（回應已存證，待人工看格式）";
    else if (ref === null) verdict = `🟡 報價 ${p}（真值源暫不可用）`;
    else {
      const eUsd = Math.abs(p - ref.usd) / ref.usd * 10000;
      const eUsdt = Math.abs(p - ref.usdt) / ref.usdt * 10000;
      const basis = eUsd <= eUsdt ? "USD" : "USDT";
      bps = Math.min(eUsd, eUsdt);
      verdict = `${bps < 10 ? "✅" : bps < 50 ? "🟠" : "🚨"} 報價 ${p}（判定 ${basis} 基準）vs 中位 ${basis === "USD" ? ref.usd.toFixed(2) : ref.usdt.toFixed(2)}｜誤差 ${bps.toFixed(1)} bps`;
    }
  } else verdict = "✅ 有出貨（非幣價類，只驗交付）";

  rows.push(`${verdict}｜${t.name}｜$${o.usd}｜${ms}ms${tx ? "" : "｜未扣款"}`);
  appendFileSync(new URL("../log/probe-round-1.jsonl", import.meta.url), JSON.stringify({
    t_send: tSend, name: t.name, url: t.url, price_usd: o.usd, http_status: status,
    latency_ms: ms, ref_usd: ref?.usd ?? null, ref_usdt: ref?.usdt ?? null, err_bps: bps,
    tx, body_sha256: createHash("sha256").update(raw).digest("hex"),
    raw: raw.slice(0, 2000),
  }) + "\n");
}

console.log(rows.join("\n"));
console.log(`\n本輪實際花費: $${spent.toFixed(3)}｜存證: day1/log/probe-round-1.jsonl`);
