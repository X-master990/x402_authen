// 我的第一個 x402 攤位：GET /hello-402，$0.01/次
// 經 CDP facilitator 結算 → 自動上架 Bazaar（v2 沒有 discoverable 旗標，結算即上架）
// 收款錢包由 CDP 代管，啟動時會印出收款地址
import "dotenv/config";
import express from "express";
import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";

for (const k of ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"]) {
  if (!process.env[k]) {
    console.error(`缺環境變數 ${k}——去 portal.cdp.coinbase.com 拿，放進 seller/.env`);
    process.exit(1);
  }
}
const ENV = (process.env.X402_ENV ?? "development") as "development" | "production";
const PORT = Number(process.env.PORT ?? 8402);

const server = await createX402Server({
  environment: ENV,
  routes: {
    "GET /hello-402": {
      price: "$0.01",
      description: "Hello from Taiwan — a signed timestamp from my first x402 stall",
    },
  },
});

const app = express();

// 免費健康檢查（部署平台要用，也讓人不付錢就能看到攤位介紹）
app.get("/", (_req, res) =>
  res.json({
    service: "hello-402",
    paid_routes: { "GET /hello-402": "$0.01" },
    env: ENV,
  }),
);

app.use(paymentMiddlewareFromHTTPServer(server));

app.get("/hello-402", (_req, res) =>
  res.json({
    hello: "402",
    t: new Date().toISOString(),
    note: "You just paid a Taiwanese builder $0.01 over HTTP. Machines trading with machines.",
  }),
);

app.listen(PORT, () => {
  console.log(`攤位開張｜環境: ${ENV}｜port: ${PORT}`);
  console.log(`收款地址（CDP 代管）: ${server.payToEvmAddress}`);
  console.log(`測試: curl -i http://localhost:${PORT}/hello-402  → 應回 402 + PAYMENT-REQUIRED 標頭`);
});
