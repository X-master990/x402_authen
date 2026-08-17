# 內容日曆：13 週中文長文 + 每日英文短帖

> 節奏鐵律：**每週一篇中文長文 + 每天一則英文 X 短帖**。
> 長文發佈日固定（建議週日晚上，週末整天寫）。短帖每天固定時段發（建議台灣時間 21:00–23:00 = 美東早上，x402 生態主要受眾醒著）。
> 原則：**內容是引擎的副產品，不是額外工作。** 每篇長文的素材都來自當週本來就要做的事。

---

## 一、13 週中文長文題目清單

每篇的結構固定：一個鉤子（具體數字或事件）→ 白話解釋 → 實際數據/截圖 → 一個行動呼籲（訂閱電子報 / 看榜單）。

| 週 | 題目 | 素材來源（當週本來就在做的事） |
|---|------|------------------------------|
| W1 | 《從零到收到第一筆機器付款：我用 x402 花 0.01 美金買了一個幣價，然後自己也開了一個攤》 | Day 1–3 的實戰全紀錄。含錢包、USDC、買方腳本、賣方 endpoint 四步驟教學 |
| W2 | 《我掃了 x402 Bazaar 全目錄：號稱賣金融數據的攤販，有幾攤是真的開著？》 | 引擎 v0 的第一輪全量探活結果。死攤率數字自帶爆點 |
| W3 | 《AI 買數據不會驗貨，所以我來當驗貨員：四招方法論全公開》 | 對答案／放金絲雀／蓋時間戳／跑跑分。這篇就是日後方法論頁面的底稿 |
| W4 | 《榜單上線：x402 金融數據準確度榜第一期——誰的報價最接近交易所？》 | 榜單 A 上線發佈文。附前三名與吊車尾（代號）的誤差圖 |
| W5 | 《跑了一週榜單我發現的三件怪事》 | 第一週監測中的異常案例：延遲尖峰、時間戳漂移、報價卡住不動的殭屍攤 |
| W6 | 《付費喊單老師的照妖鏡：我怎麼給每一則訊號蓋時間戳》 | 榜單 B 方法論預告文。先講規則再公佈成績，公信力鋪墊 |
| W7 | 《訊號商成績單第一期：蓋了時間戳之後，勝率還剩多少？》 | 榜單 B 上線發佈文。全代號，方法論連結置頂 |
| W8 | 《State of x402 數據品質報告（中文版）》 | 8 週監測數據總結。英文版同步投生態（awesome-x402 PR + X tag 專案） |
| W9 | 《報告發出去之後：x402 生態的人怎麼反應，我學到什麼》 | 發佈後的迴響、優等生聯絡紀錄、免費徽章第一批發放 |
| W10 | 《「已驗證」徽章是怎麼發的：我的審核標準全公開》 | 收費前導文。把免費徽章的標準寫死，為付費版鋪路 |
| W11 | 《為什麼賣家願意付錢被我監督？——驗證即服務的生意邏輯》 | 第一批付費賣家談判過程（匿名化）。順帶公開報價 $19–49/月 |
| W12 | 《90 天做一個 x402 小生意：收入、成本、時數，數字全公開》 | Build in public 復盤文。誠實數字自帶傳播力 |
| W13 | 《台北區塊鏈週前瞻：agent 付款生態年底卡位戰》 | 年底活動預熱 + 現場約人。長文同時是自我介紹信 |

**備援題目**（某週素材不夠時替換，不新增工作量）：
- 《x402 上一筆 $0.01 的付款，錢實際上怎麼流？》（技術科普）
- 《我被一個假數據攤騙了 $0.05：完整解剖》（有踩雷案例時用，代號）
- 《ERC-8004 的登記簿是空格子：誰來填分數？》（生態評論）

## 二、每日英文 X 短帖：5 個輪替模板

每天一則，固定格式輪替。**每則 = 一張圖 + 一句觀察 + 一個連結**，寫作時間壓在 10 分鐘內。

**模板 1｜每日榜單快照（每週 2–3 次，主力）**
> 📊 x402 finance-data accuracy board, day {N}
> Best spread vs Binance today: {X} bps ({vendor})
> Worst: {Y} bps (vendor #{codename})
> {one-line observation}
> Full board (free, hourly): {link}

**模板 2｜異常抓包（有事件時，最高互動）**
> 🚨 Caught live: endpoint #{codename} served a BTC price {X}% off Binance for {N} minutes today.
> Timestamped, archived, receipts on the board.
> This is why agents need a produce inspector. {link}

**模板 3｜生態數據觀察（每週 1–2 次）**
> Probed {N} x402 finance endpoints this week, paid real USDC for every call.
> {alive}% answered. {accurate}% within 10 bps of ground truth.
> The gap between "responds" and "correct" is the whole story.

**模板 4｜建造日誌（每週 1 次，build in public）**
> Week {N} of building the x402 data-quality board:
> ✅ {shipped thing}
> 📈 {one metric}
> Next: {one thing}

**模板 5｜提問/互動（每週 1 次，養演算法）**
> Question for x402 sellers: would you pay $19/mo to know your feed drifted from Binance *before* your buyers notice?
> (Building exactly this — DMs open.)

**短帖紀律**：
- 點名讚美可用真名；點名批評一律用代號 #（見 `04-legal.md` 代號規則）。
- 每則附圖：榜單截圖或誤差走勢圖，圖上帶浮水印網址（偷圖也是宣傳）。
- 固定 hashtag/tag 池：#x402、@coinbasedev 相關帳號、被讚美的賣家官方帳號（tag 優等生 = 免費觸及他們的受眾）。

## 三、發佈通路檢查表

- 中文長文：自有電子報（第 2 週前開好，Substack 或 Paragraph）+ 轉發 Facebook/Threads 台灣技術社群。
- 英文：X 帳號（Day 4 開）為主；W8 報告另投 awesome-x402 PR。
- 所有長文文末固定三行：榜單連結｜電子報訂閱｜「發現你的數據源上榜了？來聊」聯絡方式。
