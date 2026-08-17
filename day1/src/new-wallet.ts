// 產生一個全新的探測專用錢包（Base 是 EVM 鏈，這就是一個標準 EVM 帳戶）
// 用法：npm run new-wallet
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);

console.log("=== 新探測錢包 ===");
console.log("地址（收 USDC 用這個）:", account.address);
console.log("私鑰（放進 day1/.env 的 EVM_PRIVATE_KEY）:", pk);
console.log();
console.log("安全規則：");
console.log("1. 這是探測專用錢包，裡面永遠只放 <= $30 USDC");
console.log("2. 私鑰只存在 .env（已在 .gitignore），另外抄一份放密碼管理器");
console.log("3. 不需要 ETH！x402 的 exact 付款走 EIP-3009 簽名，gas 由 facilitator 出");
