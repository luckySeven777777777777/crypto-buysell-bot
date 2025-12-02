// server.js
import express from "express";
import TelegramBot from "node-telegram-bot-api";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());

const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = -1003262870745;
const PRIVATE_ID = 6062973135;
const ADMIN_IDS = [PRIVATE_ID];

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const trades = {}; // 内存存储交易

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
类型: *${trade.tradeType}*
币种: *${trade.coin}*
交易金额: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
时间: ${new Date().toLocaleString()}
`;

  const keyboard = createButtons(tradeId);

  await bot.sendMessage(GROUP_ID, msg, { parse_mode: "Markdown", reply_markup: keyboard });
  await bot.sendMessage(PRIVATE_ID, msg, { parse_mode: "Markdown", reply_markup: keyboard });
}

// 处理按钮点击
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
类型: ${trade.tradeType}
币种: ${trade.coin}
交易金额: ${trade.amount} ${trade.amountCurrency}
TP: ${trade.tp || "None"}
SL: ${trade.sl || "None"}
时间: ${new Date().toLocaleString()}`
    : `❌ 交易已取消！
操作人: ${user}
类型: ${trade.tradeType}
币种: ${trade.coin}
交易金额: ${trade.amount} ${trade.amountCurrency}
TP: ${trade.tp || "None"}
SL: ${trade.sl || "None"}
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

// 提交交易接口
app.post("/trade", async (req, res) => {
  const trade = req.body;
  if (!trade.tradeType || !trade.coin || !trade.amount || !trade.amountCurrency) {
    return res.status(400).send("缺少参数");
  }
  await sendTrade(trade);
  res.status(200).send("提交成功");
});

app.listen(8080, () => console.log("服务器已启动，端口 8080"));
