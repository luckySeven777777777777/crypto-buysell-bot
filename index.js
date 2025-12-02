import express from "express";
import TelegramBot from "node-telegram-bot-api";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const __dirname = path.resolve();
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = 8080;

// ============================
// 你的 Telegram 配置（已填写）
// ============================
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = -1003262870745;
const PRIVATE_ID = 6062973135;

// 管理员（你自己）
const ADMIN_IDS = [PRIVATE_ID];

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 用来保存所有订单
const trades = {};

// 创建按钮
function createButtons(id) {
  return {
    inline_keyboard: [
      [
        { text: "✔ 成功交易", callback_data: `OK|${id}` },
        { text: "✖ 取消交易", callback_data: `CANCEL|${id}` }
      ]
    ]
  };
}

// 发送消息到 Telegram
async function sendToTelegram(trade) {
  const id = uuidv4();   // unique ID
  trades[id] = trade;    // 保存订单

  const msg = `
📣 *新的交易订单*
类型: *${trade.type}*
币种: *${trade.coin}*
交易金额: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp}*
SL: *${trade.sl}*
时间: ${trade.time}
`;

  const buttons = createButtons(id);

  await bot.sendMessage(GROUP_ID, msg, { parse_mode: "Markdown", reply_markup: buttons });
  await bot.sendMessage(PRIVATE_ID, msg, { parse_mode: "Markdown", reply_markup: buttons });
}

// 按钮点击处理
bot.on("callback_query", async (query) => {
  const userId = query.from.id;

  // 权限
  if (!ADMIN_IDS.includes(userId)) {
    await bot.answerCallbackQuery(query.id, { text: "❌ 无权限", show_alert: true });
    return;
  }

  const data = query.data.split("|");
  const action = data[0];
  const id = data[1];

  const t = trades[id];

  if (!t) {
    await bot.answerCallbackQuery(query.id, { text: "❌ 交易不存在", show_alert: true });
    return;
  }

  const operator = query.from.username || query.from.first_name;

  let result = "";

  if (action === "OK") {
    result = `✔ 交易已成功！
操作人: ${operator}
类型: ${t.type}
币种: ${t.coin}
交易金额: ${t.amount} ${t.amountCurrency}
TP: ${t.tp}
SL: ${t.sl}
时间: ${new Date().toLocaleString()}`;
  } else {
    result = `❌ 交易已取消！
操作人: ${operator}
类型: ${t.type}
币种: ${t.coin}
交易金额: ${t.amount} ${t.amountCurrency}
TP: ${t.tp}
SL: ${t.sl}
时间: ${new Date().toLocaleString()}`;
  }

  await bot.editMessageText(result, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [] }
  });

  await bot.answerCallbackQuery(query.id, { text: "已记录" });

  delete trades[id];  // 删除记录
});

// 前端提交交易
app.post("/trade", async (req, res) => {
  const t = req.body;

  // 后端必须有这些字段（和前端匹配）
  const trade = {
    type: t.type,
    coin: t.coin,
    amount: t.amount,
    amountCurrency: t.amountCurrency,
    tp: t.tp || "None",
    sl: t.sl || "None",
    time: t.time
  };

  await sendToTelegram(trade);
  res.send("OK");
});

app.listen(PORT, () => console.log("服务器已启动"));
