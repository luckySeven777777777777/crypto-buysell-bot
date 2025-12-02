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

// 管理员列表
const ADMINS = [PRIVATE_ID, GROUP_ID];

// 初始化轮询 Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 存储订单信息，每笔订单独立锁定
let ORDER_ID = 10001;
let pendingOrders = {}; 
// pendingOrders[orderId] = { messages: [{chatId,messageId}], locked: false }

function createInlineKeyboard(orderId) {
  return {
    inline_keyboard: [
      [
        { text: "✔ 成功交易", callback_data: `ok_${orderId}` },
        { text: "✖ 取消交易", callback_data: `cancel_${orderId}` }
      ]
    ]
  };
}

// 发送消息到群和私人
async function sendTradeMessage(trade) {
  const orderId = ORDER_ID++;
  pendingOrders[orderId] = { messages: [], locked: false };

  const msg = `
📣 *New Trade Request*
🆔 Order ID: ${orderId}
Type: *${trade.tradeType.toUpperCase()}*
Coin: *${trade.coin}*
Amount: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
Time: ${new Date().toLocaleString()}
`;

  for (const chatId of ADMINS) {
    try {
      const sent = await bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
        reply_markup: createInlineKeyboard(orderId),
      });
      pendingOrders[orderId].messages.push({ chatId: sent.chat.id, messageId: sent.message_id });
    } catch (e) {
      console.log(`发送到 ${chatId} 失败:`, e.response?.description || e.message);
    }
  }
}

// 处理按钮点击
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const fromUser = callbackQuery.from.username
    ? `@${callbackQuery.from.username}`
    : callbackQuery.from.first_name;

  // 解析订单 ID
  const [action, orderIdStr] = callbackQuery.data.split("_");
  const orderId = parseInt(orderIdStr);

  const order = pendingOrders[orderId];
  if (!order) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: "订单不存在或已过期", show_alert: true });
    return;
  }

  // 只允许管理员点击
  if (!ADMINS.includes(callbackQuery.from.id)) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: "只有管理员可以操作订单", show_alert: true });
    return;
  }

  // 订单独立锁定
  if (order.locked) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: "此订单已处理过", show_alert: true });
    return;
  }
  order.locked = true;

  // 更新原消息按钮为“已操作 by XXX”
  for (const msg of order.messages) {
    try {
      await bot.editMessageReplyMarkup({
        inline_keyboard: [[{ text: `已操作 by ${fromUser}`, callback_data: "none" }]]
      }, {
        chat_id: msg.chatId,
        message_id: msg.messageId
      });
    } catch (e) {
      console.log("更新按钮失败:", e.message);
    }
  }

  // 发送处理结果
  const finalText = action === "ok"
    ? `✔ 交易已确认成功\n🆔 Order ID: ${orderId}\n操作者: ${fromUser}`
    : `❌ 交易已取消\n🆔 Order ID: ${orderId}\n操作者: ${fromUser}`;

  for (const adminId of ADMINS) {
    try {
      await bot.sendMessage(adminId, finalText, { parse_mode: "Markdown" });
    } catch (e) {
      console.log(`发送处理结果到 ${adminId} 失败:`, e.message);
    }
  }

  await bot.answerCallbackQuery(callbackQuery.id);
});

// /trade 接口
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
