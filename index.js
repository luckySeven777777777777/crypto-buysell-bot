import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GROUP_ID = -1003262870745;
const PRIVATE_ID = 6062973135;

// 生成内联键盘
function createInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✔️ 成功交易", callback_data: "trade_success" },
        { text: "❌ 取消交易", callback_data: "trade_cancel" }
      ]
    ]
  };
}

// 发送消息到群和私人
async function sendTradeMessage(trade) {
  const msg = `📣 *新交易请求*
类型: *${trade.tradeType.toUpperCase()}*
币种: *${trade.coin}*
数量: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "无"}*
SL: *${trade.sl || "无"}*
时间: ${new Date().toLocaleString()}`;

  for (const chat_id of [GROUP_ID, PRIVATE_ID]) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: msg,
        parse_mode: "Markdown",
        reply_markup: createInlineKeyboard()
      })
    });
  }
}

// Webhook
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;

    // 处理按钮点击
    if (update.callback_query) {
      const chat_id = update.callback_query.message.chat.id;
      const message_id = update.callback_query.message.message_id;
      const from_user = update.callback_query.from.username
        ? `@${update.callback_query.from.username}`
        : update.callback_query.from.first_name;

      let textUpdate = "";
      if (update.callback_query.data === "trade_success") {
        textUpdate = `✔️ 交易已成功！\n操作人: ${from_user}\n时间: ${new Date().toLocaleString()}`;
      } else if (update.callback_query.data === "trade_cancel") {
        textUpdate = `❌ 交易已取消！\n操作人: ${from_user}\n时间: ${new Date().toLocaleString()}`;
      }

      await fetch(`${TELEGRAM_API}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          message_id,
          text: textUpdate,
          parse_mode: "Markdown"
        })
      });

      await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: update.callback_query.id })
      });

      return res.sendStatus(200);
    }

    // 普通 trade POST 请求
    if (update.tradeType) {
      await sendTradeMessage(update);
      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// 测试路由
app.get("/", (req, res) => {
  res.send("Bot is running ✅");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
