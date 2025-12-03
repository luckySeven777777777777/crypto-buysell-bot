import express from "express";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 8080;

// ⚠️ 请替换为你自己的 Token、群ID、个人ID
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = -1003262870745;
const PRIVATE_ID = 6062973135;

// 初始化 Bot（polling）
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 保存已操作用户，避免重复点击
const actionMap = new Map(); // message_id -> user_id

// 创建按钮
function createInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✔️ 成功交易", callback_data: "trade_success" },
        { text: "✖️ 取消交易", callback_data: "trade_cancel" }
      ]
    ]
  };
}

// 发送消息到群和个人
async function sendTradeMessage(trade) {
  const msg = `📣 *New Trade Request*
Type: *${trade.tradeType.toUpperCase()}*
Coin: *${trade.coin}*
Amount: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
Time: ${new Date().toLocaleString()}
`;

  const options = {
    parse_mode: "Markdown",
    reply_markup: createInlineKeyboard(),
  };

  const groupMsg = await bot.sendMessage(GROUP_ID, msg, options);
  const privateMsg = await bot.sendMessage(PRIVATE_ID, msg, options);

  // 为两条消息初始化 actionMap
  actionMap.set(groupMsg.message_id, null);
  actionMap.set(privateMsg.message_id, null);
}

// 处理按钮点击事件
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const userId = callbackQuery.from.id;

  const originalText = callbackQuery.message.text;

  // 宽松匹配：兼容带星号和不带星号
  const coinMatch = originalText.match(/Coin:\s\*?(.+?)\*?\n/);
  const amountMatch = originalText.match(/Amount:\s\*?(.+?)\*?\n/);

  const coin = coinMatch ? coinMatch[1].trim() : "Unknown";
  const amount = amountMatch ? amountMatch[1].trim() : "Unknown";

  const fromUser = callbackQuery.from.username
    ? `@${callbackQuery.from.username}`
    : callbackQuery.from.first_name;

  // 防止重复点击
  const already = actionMap.get(messageId);
  if (already && already !== userId) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: "此交易已被其他管理员处理。",
      show_alert: true,
    });
  }
  if (already === userId) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: "你已经操作过了。",
      show_alert: true,
    });
  }

  actionMap.set(messageId, userId);

  let textUpdate = "";

  if (callbackQuery.data === "trade_success") {
    textUpdate =
`✔️ *交易已成功！*
币种: *${coin}*
金额: *${amount}*
操作人: ${fromUser}
时间: ${new Date().toLocaleString()}`;
  } else if (callbackQuery.data === "trade_cancel") {
    textUpdate =
`❌ *交易已取消！*
币种: *${coin}*
金额: *${amount}*
操作人: ${fromUser}
时间: ${new Date().toLocaleString()}`;
  }

  // 删除按钮
  await bot.editMessageText(textUpdate, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [] },
  });

  await bot.answerCallbackQuery(callbackQuery.id);
});

// /trade 接口，前端调用
app.post("/trade", async (req, res) => {
  try {
    const trade = req.body;

    if (!trade.tradeType || !trade.coin || !trade.amount) {
      return res.status(400).send("Missing trade parameters");
    }

    await sendTradeMessage(trade);
    res.status(200).send("Trade sent successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// 测试路由
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// 启动服务器
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
