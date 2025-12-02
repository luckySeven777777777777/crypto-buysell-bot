import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

// ========================
// 配置
// ========================
const TELEGRAM_BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const TELEGRAM_CHAT_ID = -1003262870745; // 群ID
const ADMIN_USERNAMES = ["admin1", "admin2"]; // 管理员用户名
const PORT = process.env.PORT || 8080;

// 模拟币种汇率
const coins = ["BTC","ETH","USDT","USDC","BNB","ADA","DOGE","XRP","LTC","DOT","SOL","MATIC"];
let rate = {};
coins.forEach(c => rate[c] = Math.random()*0.1+0.01);
rate["USDT"] = 1;

// ========================
// Express App
// ========================
const app = express();
app.use(bodyParser.json());

// ========================
// Webhook 路由
// ========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // 必须立即返回 200
  try {
    const update = req.body;

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch(err) {
    console.error("Webhook processing error:", err);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ========================
// 处理普通消息（可扩展）
// ========================
async function handleMessage(message) {
  console.log("Received message:", message.text);
}

// ========================
// 按钮点击回调处理
// ========================
async function handleCallback(callback) {
  const data = callback.data;
  const from = callback.from;
  const msg_id = callback.message.message_id;

  // 判断是否管理员
  if (!ADMIN_USERNAMES.includes(from.username)) {
    await answerCallback(callback.id, "你不是管理员，无法操作");
    return;
  }

  let text = "";
  if (data === "trade_success") {
    text = `✅ 交易已成功！\n操作人: @${from.username || from.first_name}\n时间: ${new Date().toLocaleString()}`;
  } else if (data === "trade_cancel") {
    text = `❌ 交易已取消！\n操作人: @${from.username || from.first_name}\n时间: ${new Date().toLocaleString()}`;
  }

  // 编辑原消息
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      message_id: msg_id,
      text: text
    })
  });

  // 回复按钮点击
  await answerCallback(callback.id, "操作成功");
}

// 回复回调 query
async function answerCallback(callback_id, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callback_id,
      text
    })
  });
}

// ========================
// 发送交易消息到群
// ========================
export async function sendTradeMessage(tradeType, coin, amount, amountCurrency, tp, sl) {
  const text = `📣 *New Trade Request*\nType: *${tradeType.toUpperCase()}*\nCoin: *${coin}*\nAmount: *${amount} ${amountCurrency}*\nTP: *${tp || "None"}*\nSL: *${sl || "None"}*\nTime: ${new Date().toLocaleString()}`;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✔ 成功交易", callback_data: "trade_success" },
            { text: "✖ 取消交易", callback_data: "trade_cancel" }
          ]
        ]
      }
    })
  });
}

// ========================
// HTTP POST /trade 触发交易消息
// ========================
app.post("/trade", async (req, res) => {
  const { tradeType, coin, amount, amountCurrency, tp, sl } = req.body;
  try {
    await sendTradeMessage(tradeType, coin, amount, amountCurrency, tp, sl);
    res.json({ ok: true });
  } catch(err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
