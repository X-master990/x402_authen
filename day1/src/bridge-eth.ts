// 把主網剩餘的 ETH 零頭橋到 Base 當封條 gas（走 Relay API，不經任何網頁介面）
// 用法：npm run bridge-eth
// 安全檢查：收款人必須是本人、到帳 < $0.10 中止、只在主網執行、revert 即停
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, base } from "viem/chains";

const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const AMOUNT_WEI = 105000000000000n; // 0.000105 ETH，主網留 ~0.000015 當日後 gas 零頭

const ethPub = createPublicClient({ chain: mainnet, transport: http("https://ethereum-rpc.publicnode.com") });
const basePub = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
const wallet = createWalletClient({ account, chain: mainnet, transport: http("https://ethereum-rpc.publicnode.com") });

console.log("地址:", account.address);
const balMain = await ethPub.getBalance({ address: account.address });
console.log("主網 ETH:", formatEther(balMain));
if (balMain < AMOUNT_WEI) throw new Error("主網餘額不足此金額");
const balBefore = await basePub.getBalance({ address: account.address });

const q = await fetch("https://api.relay.link/quote", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user: account.address, recipient: account.address,
    originChainId: 1, destinationChainId: 8453,
    originCurrency: "0x0000000000000000000000000000000000000000",
    destinationCurrency: "0x0000000000000000000000000000000000000000",
    amount: AMOUNT_WEI.toString(), tradeType: "EXACT_INPUT",
  }),
});
if (!q.ok) throw new Error(`Relay 報價失敗 ${q.status}: ${await q.text()}`);
const quote: any = await q.json();
const dout = quote.details?.currencyOut;
console.log(`報價: 送出 ${formatEther(AMOUNT_WEI)} ETH → 到帳 ${formatEther(BigInt(dout?.amount ?? 0))} ETH (Base)（~$${dout?.amountUsd}）`);

if (quote.details?.recipient?.toLowerCase() !== account.address.toLowerCase()) throw new Error("收款人不是本人，中止");
if (Number(dout?.amountUsd ?? 0) < 0.10) throw new Error(`到帳 $${dout?.amountUsd} 低於 $0.10 底線，中止`);

for (const step of quote.steps ?? []) for (const item of step.items ?? []) {
  const d = item.data; if (!d?.to) continue;
  if (d.chainId && Number(d.chainId) !== 1) throw new Error(`出現非主網步驟 chainId=${d.chainId}，中止`);
  console.log(`執行步驟 ${step.id} → ${d.to}`);
  const hash = await wallet.sendTransaction({ to: d.to, data: (d.data ?? "0x") as `0x${string}`, value: BigInt(d.value ?? 0) });
  console.log("已送出:", `https://etherscan.io/tx/${hash}`);
  const rc = await ethPub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error("交易 revert，中止");
}

console.log("等待 Base 到帳…");
for (let i = 0; i < 60; i++) {
  const b = await basePub.getBalance({ address: account.address });
  if (b > balBefore) { console.log(`✅ Base ETH 到帳: ${formatEther(b)}`); process.exit(0); }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log("5 分鐘未到帳——用 basescan 查地址，或稍後 npm run check");
