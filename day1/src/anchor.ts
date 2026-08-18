// 封條：把 log/*.jsonl 所有存證紀錄逐行 SHA-256 → Merkle root → 釘上 Base
// 用法：npm run anchor（每天跑一次；同一天重跑會直接跳過）
// 驗證方式（任何人）：對紀錄檔每行算 SHA-256 作為葉子，兩兩串接再 SHA-256 往上疊
// （奇數個時最後一個與自己配對），樹頂 root 應等於鏈上交易 calldata 的最後 32 bytes。
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const logDir = new URL("../log/", import.meta.url);
const anchorDir = new URL("../anchors/", import.meta.url); // 公開目錄，進 git
mkdirSync(anchorDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const outUrl = new URL(`../anchors/${today}.json`, import.meta.url);
if (existsSync(outUrl)) {
  console.log(`今天（${today}）已釘過封條: ${JSON.parse(readFileSync(outUrl, "utf8")).tx}`);
  process.exit(0);
}

// 1. 收集所有存證行 → 葉子雜湊
const files = readdirSync(logDir).filter((f) => f.endsWith(".jsonl")).sort();
const manifest: Record<string, { lines: number; file_sha256: string }> = {};
const leaves: string[] = [];
for (const f of files) {
  const content = readFileSync(new URL(`../log/${f}`, import.meta.url), "utf8");
  const lines = content.split("\n").filter(Boolean);
  manifest[f] = { lines: lines.length, file_sha256: createHash("sha256").update(content).digest("hex") };
  for (const line of lines) leaves.push(createHash("sha256").update(line).digest("hex"));
}
if (!leaves.length) { console.error("log/ 沒有可封存的紀錄"); process.exit(1); }

// 2. Merkle root
let level = leaves.slice();
while (level.length > 1) {
  const next: string[] = [];
  for (let i = 0; i < level.length; i += 2) {
    const pair = level[i] + (level[i + 1] ?? level[i]);
    next.push(createHash("sha256").update(Buffer.from(pair, "hex")).digest("hex"));
  }
  level = next;
}
const root = level[0];
console.log(`封存 ${leaves.length} 筆紀錄（${files.join("、")}）`);
console.log("Merkle root:", root);

// 3. 釘上 Base：一筆給自己的 0 元交易，calldata = 前綴 + root
const rpc = http("https://mainnet.base.org");
const pub = createPublicClient({ chain: base, transport: rpc });
const wallet = createWalletClient({ account, chain: base, transport: rpc });
const data = ("0x" + Buffer.from(`x402-authen:v1:${today}:`).toString("hex") + root) as `0x${string}`;
const hash = await wallet.sendTransaction({ to: account.address, value: 0n, data });
console.log("已送出:", `https://basescan.org/tx/${hash}`);
const rc = await pub.waitForTransactionReceipt({ hash });
if (rc.status !== "success") throw new Error("封條交易 revert");
const fee = rc.gasUsed * (rc.effectiveGasPrice ?? 0n);

// 4. 公開驗證檔
writeFileSync(outUrl, JSON.stringify({
  date: today, merkle_root: root, leaves: leaves.length, files: manifest,
  chain: "base (eip155:8453)", tx: hash, anchored_by: account.address,
  how_to_verify: "sha256 each line of each file as leaves; pair-concat-hash upward (odd leaf pairs with itself); root must equal last 32 bytes of tx calldata",
}, null, 2));
console.log(`✅ 封條已釘上 Base｜gas 花費 ${formatEther(fee)} ETH｜驗證檔: day1/anchors/${today}.json`);
