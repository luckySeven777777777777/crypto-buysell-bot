import express from "express";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

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

// 初始化轮询 Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 内存存储交易信息
const trades = {}; // key: tradeId, value: trade对象

// 创建按钮，只传 tradeId
function createInlineKeyboard(tradeId) {
  return {
    inline_keyboard: [
      [
        { text: "✔ 成功交易", callback_data: `trade_success_${tradeId}` },
        { text: "✖ 取消交易", callback_data: `trade_cancel_${tradeId}` }
      ]
    ]
  };
}

// 发送消息到群和个人
async function sendTradeMessage(trade) {
  const tradeId = uuidv4();
  trades[tradeId] = trade; // 保存到内存

  const msg = `
📣 *New Trade Request*
Type: *${trade.tradeType.toUpperCase()}*
Coin: *${trade.coin}*
Amount: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
Time: ${new Date().toLocaleString()}
`;

  const keyboard = createInlineKeyboard(tradeId);

  await bot.sendMessage(GROUP_ID, msg, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });

  await bot.sendMessage(PRIVATE_ID, msg, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

// 处理按钮点击
bot.on("callback_query", async (callbackQuery) => {
  const userId = callbackQuery.from.id;

  if (!ADMIN_IDS.includes(userId)) {
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ 你没有权限操作此按钮",
      show_alert: true,
    });
    return;
  }

  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const fromUser = callbackQuery.from.username || callbackQuery.from.first_name;

  // callback_data 格式: action_tradeId
  const [action, tradeId] = callbackQuery.data.split("_");
  const trade = trades[tradeId];

  if (!trade) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ 交易信息不存在", show_alert: true });
    return;
  }

  const textUpdate = action === "trade_success"
    ? `✔ 交易已成功！
操作人: ${fromUser}
类型: ${trade.tradeType}
币种: ${trade.coin}
交易金额: ${trade.amount} ${trade.amountCurrency}
TP: ${trade.tp || "None"}
SL: ${trade.sl || "None"}
时间: ${new Date().toLocaleString()}`
    : `❌ 交易已取消！
操作人: ${fromUser}
类型: ${trade.tradeType}
币种: ${trade.coin}
交易金额: ${trade.amount} ${trade.amountCurrency}
TP: ${trade.tp || "None"}
SL: ${trade.sl || "None"}
时间: ${new Date().toLocaleString()}`;

  // 更新消息并移除按钮
  await bot.editMessageText(textUpdate, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [] },
  });

  await bot.answerCallbackQuery(callbackQuery.id, { text: "操作已记录" });

  // 删除缓存
  delete trades[tradeId];
});

// /trade 接口，前端调用
app.post("/trade", async (req, res) => {
  try {
    const trade = req.body;
    if (!trade.tradeType || !trade.coin || !trade.amount || !trade.amountCurrency) {
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
