import express from "express";
import TelegramBot from "node-telegram-bot-api";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const __dirname = path.resolve();
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 8080; // Railway 会自动提供 PORT

// Telegram 配置
const BOT_TOKEN = process.env.BOT_TOKEN || "你的BotToken";
const GROUP_ID = process.env.GROUP_ID || -1003262870745;
const PRIVATE_ID = process.env.PRIVATE_ID || 6062973135;
const ADMIN_IDS = [PRIVATE_ID];

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const trades = {}; // 存储交易信息

// 创建按钮
function createButtons(tradeId) {
  return {
    inline_keyboard: [
      [
        { text: "✔ 成功交易", callback_data: `trade_success|${tradeId}` },
        { text: "✖ 取消交易", callback_data: `trade_cancel|${tradeId}` }
      ]
    ]
  };
}

// 发送交易消息
async function sendTrade(trade) {
  const tradeId = uuidv4();
  trades[tradeId] = trade;

  const msg = `
📣 *New Trade Request*
类型: *${trade.type}*
币种: *${trade.coin}*
交易金额: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
时间: ${trade.time}
`;

  const keyboard = createButtons(tradeId);

  await bot.sendMessage(GROUP_ID, msg, { parse_mode: "Markdown", reply_markup: keyboard });
  await bot.sendMessage(PRIVATE_ID, msg, { parse_mode: "Markdown", reply_markup: keyboard });
}

// 按钮点击处理
bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  if (!ADMIN_IDS.includes(userId)) {
    await bot.answerCallbackQuery(query.id, { text: "❌ 无权限", show_alert: true });
    return;
  }

  const [action, tradeId] = query.data.split("|");
  const trade = trades[tradeId];

  if (!trade) {
    await bot.answerCallbackQuery(query.id, { text: "❌ 交易不存在", show_alert: true });
    return;
  }

  const user = query.from.username || query.from.first_name;
  const text = action === "trade_success"
    ? `✔ 交易已成功！
操作人: ${user}
类型: ${trade.type}
币种: ${trade.coin}
交易金额: ${trade.amount} ${trade.amountCurrency}
TP: ${trade.tp}
SL: ${trade.sl}
时间: ${new Date().toLocaleString()}`
    : `❌ 交易已取消！
操作人: ${user}
类型: ${trade.type}
币种: ${trade.coin}
交易金额: ${trade.amount} ${trade.amountCurrency}
TP: ${trade.tp}
SL: ${trade.sl}
时间: ${new Date().toLocaleString()}`;

  await bot.editMessageText(text, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [] },
  });

  await bot.answerCallbackQuery(query.id, { text: "操作已记录" });
  delete trades[tradeId];
});

// 接收前端交易提交
app.post("/trade", async (req, res) => {
  const trade = req.body;

  if (!trade.type || !trade.coin || !trade.amount || !trade.amountCurrency) {
    return res.status(400).send("缺少交易参数");
  }

  trade.tp = trade.tp || "None";
  trade.sl = trade.sl || "None";
  trade.time = trade.time || new Date().toLocaleString();

  await sendTrade(trade);
  res.status(200).send("交易提交成功");
});

app.listen(PORT, () => console.log(`服务器已启动，端口 ${PORT}`));
