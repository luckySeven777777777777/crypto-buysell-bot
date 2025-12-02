import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const TELEGRAM_BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const GROUP_ID = "-1003262870745";
const PERSONAL_ID = "6062973135";

// 发送消息
async function sendMessage(chat_id, text, keyboard = null) {
  const body = { chat_id, text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 编辑消息
async function editMessage(chat_id, message_id, text, keyboard = null) {
  const body = { chat_id, message_id, text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// /trade 测试接口
app.post("/trade", async (req, res) => {
  const { tradeType, coin, amount, amountCurrency, tp, sl } = req.body;
  if (!tradeType || !coin || !amount) return res.status(400).send("Invalid data");

  const now = new Date().toLocaleString();
  const text = `📣 *New Trade Request*\nType: *${tradeType.toUpperCase()}*\nCoin: *${coin}*\nAmount: *${amount} ${amountCurrency}*\nTP: *${tp || "None"}*\nSL: *${sl || "None"}*\nTime: ${now}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✔ 成功交易", callback_data: "trade_success" },
        { text: "❌ 取消交易", callback_data: "trade_cancel" }
      ]
    ]
  };

  // 发送到群和个人
  const groupMsg = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: GROUP_ID, text, parse_mode: "Markdown", reply_markup: keyboard }),
  }).then(r => r.json());

  await sendMessage(PERSONAL_ID, text, keyboard);

  res.status(200).json({ message: "Trade sent", groupMessageId: groupMsg.result.message_id });
});

// /webhook 接收回调
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Telegram 必须立即返回 200
  const update = req.body;

  if (!update.callback_query) return;

  const callback = update.callback_query;
  const user = callback.from.username || callback.from.first_name;
  let newText;

  if (callback.data === "trade_success") {
    newText = `✅ 交易已成功！\n操作人: @${user}\n时间: ${new Date().toLocaleString()}`;
  } else if (callback.data === "trade_cancel") {
    newText = `❌ 交易已取消！\n操作人: @${user}\n时间: ${new Date().toLocaleString()}`;
  } else return;

  const chat_id = callback.message.chat.id;
  const message_id = callback.message.message_id;

  // 同步更新所有
  await editMessage(chat_id, message_id, newText, { inline_keyboard: [] });
  if (chat_id != GROUP_ID) await editMessage(GROUP_ID, message_id, newText, { inline_keyboard: [] });
  if (chat_id != PERSONAL_ID) await editMessage(PERSONAL_ID, message_id, newText, { inline_keyboard: [] });
});

// 启动
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
