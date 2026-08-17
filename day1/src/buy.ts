// Day 1：第一筆機器付款——用 x402 v2 付 $0.01 USDC 跟 CoinGecko 買一次幣價
// 用法：npm run buy                    （預設呼叫 CoinGecko x402 simple/price）
//       npm run buy -- <任意x402網址>  （呼叫其他 endpoint）
//
// 流程（x402 v2 wire flow）：
//   1. 直接 GET → 對方回 402 + PAYMENT-REQUIRED 標頭（base64，裡面是收款條件）
//   2. @x402/fetch 用你的私鑰簽一張 EIP-3009 轉帳授權，帶 PAYMENT-SIGNATURE 標頭重試
//   3. 對方經 facilitator 驗證入帳 → 回 200 + PAYMENT-RESPONSE 標頭（含鏈上 tx）
// 這一切 wrapFetchWithPaymentFromConfig 都包掉了，我們只負責記帳存證。
import "dotenv/config";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const DEFAULT_URL =
  "https://pro-api.coingecko.com/api/v3/x402/simple/price" +
  "?ids=bitcoin,ethereum&vs_currencies=usd&include_last_updated_at=true";

const pk = process.env.EVM_PRIVATE_KEY;
if (!pk) {
  console.error("缺 EVM_PRIVATE_KEY。先跑 `npm run new-wallet`，把私鑰放進 day1/.env");
  process.exit(1);
}
const account = privateKeyToAccount(pk as `0x${string}`);
const url = process.argv[2] ?? DEFAULT_URL;

// 只註冊 Base mainnet：錢包裡只有 Base 上的 USDC，鎖死網路避免在別條鏈上意外付款。
// （若對方只收其他鏈，本次會拿回原始 402，不會扣款。）
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }],
});

console.log("探測錢包:", account.address);
console.log("目標:", url);

const tSend = new Date().toISOString();
const t0 = performance.now();
const response = await fetchWithPayment(url, { method: "GET" });
const raw = await response.text();
const latencyMs = Math.round(performance.now() - t0);
const tRecv = new Date().toISOString();

const bodyHash = createHash("sha256").update(raw).digest("hex");
const payHeader = response.headers.get("PAYMENT-RESPONSE");
const settlement = payHeader ? decodePaymentResponseHeader(payHeader) : null;

console.log(`\nHTTP ${response.status}｜${latencyMs} ms`);
console.log("回應:", raw.length > 600 ? raw.slice(0, 600) + "…(截斷)" : raw);
if (settlement) {
  console.log("\n💸 付款成功");
  console.log("  鏈上交易:", `https://basescan.org/tx/${(settlement as any).transaction}`);
  console.log("  付款人:", (settlement as any).payer);
} else {
  console.log("\n（無 PAYMENT-RESPONSE 標頭——沒付到款：可能是免費端點、或網路不合拿回 402）");
}

// 存證 DNA 從第一天開始：每一筆呼叫都留收據
mkdirSync(new URL("../log/", import.meta.url), { recursive: true });
const receipt = {
  t_send: tSend, t_recv: tRecv, url, http_status: response.status,
  latency_ms: latencyMs, body_sha256: bodyHash,
  tx: (settlement as any)?.transaction ?? null, payer: (settlement as any)?.payer ?? null,
};
appendFileSync(new URL("../log/receipts.jsonl", import.meta.url), JSON.stringify(receipt) + "\n");
console.log("\n📝 收據已存 day1/log/receipts.jsonl（body 雜湊 " + bodyHash.slice(0, 16) + "…）");
