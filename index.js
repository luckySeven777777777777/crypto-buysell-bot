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

// ⚠️ 配置你的 Token、群ID和私人ID
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = -1003262870745;
const PRIVATE_ID = 6062973135;

// 管理员ID列表
const ADMIN_IDS = [PRIVATE_ID];

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 创建按钮
function createInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✔ 成功交易", callback_data: "trade_success" },
        { text: "✖ 取消交易", callback_data: "trade_cancel" }
      ]
    ]
  };
}

// 发送消息到群和个人
async function sendTradeMessage(trade) {
  const msg = `
📣 *New Trade Request*
Type: *${trade.tradeType.toUpperCase()}*
Coin: *${trade.coin}*
Amount: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
Time: ${new Date().toLocaleString()}
`;

  // 发送到群
  await bot.sendMessage(GROUP_ID, msg, {
    parse_mode: "Markdown",
    reply_markup: createInlineKeyboard(),
  });

  // 发送到个人
  await bot.sendMessage(PRIVATE_ID, msg, {
    parse_mode: "Markdown",
    reply_markup: createInlineKeyboard(),
  });
}

// 处理按钮点击
bot.on("callback_query", async (callbackQuery) => {
  const userId = callbackQuery.from.id;

  // 仅允许管理员操作
  if (!ADMIN_IDS.includes(userId)) {
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ 你没有权限操作此按钮",
      show_alert: true,
    });
    return;
  }

  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const fromUser = callbackQuery.from.username
    ? `@${callbackQuery.from.username}`
    : callbackQuery.from.first_name;

  let textUpdate = "";
  if (callbackQuery.data === "trade_success") {
    textUpdate = `✔ 交易已成功！\n操作人: ${fromUser}\n时间: ${new Date().toLocaleString()}`;
  } else if (callbackQuery.data === "trade_cancel") {
    textUpdate = `❌ 交易已取消！\n操作人: ${fromUser}\n时间: ${new Date().toLocaleString()}`;
  }

  await bot.editMessageText(textUpdate, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
  });

  await bot.answerCallbackQuery(callbackQuery.id, { text: "操作已记录" });
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
