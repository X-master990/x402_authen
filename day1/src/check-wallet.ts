// 錢包預檢（不花錢、不顯示私鑰）：從 .env 的私鑰算出地址，查 Base 上的 USDC 和 ETH 餘額
// 用法：npm run check
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

const pk = process.env.EVM_PRIVATE_KEY ?? "";
if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
  console.error("EVM_PRIVATE_KEY 格式不對：需要 0x 開頭 + 64 個十六進位字元（不要加引號或空格）");
  process.exit(1);
}
const account = privateKeyToAccount(pk as `0x${string}`);
console.log("這把私鑰對應的地址:", account.address);

const rpc = async (method: string, params: unknown[]): Promise<string> => {
  const res = await fetch("https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return ((await res.json()) as { result: string }).result;
};

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const pad = "0x70a08231" + account.address.slice(2).toLowerCase().padStart(64, "0");
const usdc = parseInt(await rpc("eth_call", [{ to: USDC, data: pad }, "latest"]), 16);
const eth = parseInt(await rpc("eth_getBalance", [account.address, "latest"]), 16);
console.log(`USDC (Base): $${(usdc / 1e6).toFixed(2)}`);
console.log(`ETH  (Base): ${(eth / 1e18).toFixed(6)}（x402 付款用不到 ETH，0 也沒關係）`);
