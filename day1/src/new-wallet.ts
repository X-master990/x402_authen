// 產生一個全新的探測專用錢包（Base 是 EVM 鏈，這就是一個標準 EVM 帳戶）
// 私鑰直接寫入 day1/.env，畫面上不顯示——避免留在終端機紀錄裡
// 用法：npm run new-wallet
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, writeFileSync } from "node:fs";

const envPath = new URL("../.env", import.meta.url);
if (existsSync(envPath)) {
  console.error("day1/.env 已存在，不覆蓋（裡面可能是有錢的錢包私鑰）。");
  console.error("確定要換錢包的話：先把舊錢包餘額轉走，手動刪除 .env，再跑一次。");
  process.exit(1);
}

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);
writeFileSync(envPath, `EVM_PRIVATE_KEY=${pk}\n`, { mode: 0o600 });

console.log("=== 探測錢包已建立 ===");
console.log("地址（充值 USDC 用這個）:", account.address);
console.log();
console.log("私鑰已寫入 day1/.env（已在 .gitignore，不會進 repo）");
console.log();
console.log("安全規則：");
console.log("1. 這是探測專用錢包，裡面永遠只放 <= $30 USDC");
console.log("2. 現在就打開 .env 把私鑰另抄一份進密碼管理器（檔案弄丟就是錢弄丟）");
console.log("3. 不需要 ETH！x402 的 exact 付款走 EIP-3009 簽名，gas 由 facilitator 出");
