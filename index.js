import { Telegraf, Markup } from "telegraf";

// ==============================
// 配置你的 Bot Token 和 ID
// ==============================
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = -1003262870745;
const PRIVATE_ID = 6062973135;

// 多管理员（可填 Telegram 用户名）
const ADMINS = ["@YourUsername"];

const bot = new Telegraf(BOT_TOKEN);

// 内联按钮
const tradeButtons = Markup.inlineKeyboard([
  [
    Markup.button.callback("✔ 成功交易", "trade_success"),
    Markup.button.callback("❌ 取消交易", "trade_cancel")
  ]
]);

// 发送交易消息到群和私人
async function sendTradeMessage(trade) {
  const msg = `
📣 *新交易请求*
类型: *${trade.tradeType.toUpperCase()}*
币种: *${trade.coin}*
数量: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "无"}*
SL: *${trade.sl || "无"}*
时间: ${new Date().toLocaleString()}
`;

  // 群消息
  await bot.telegram.sendMessage(GROUP_ID, msg, { parse_mode: "Markdown", ...tradeButtons });

  // 私人消息
  await bot.telegram.sendMessage(PRIVATE_ID, msg, { parse_mode: "Markdown", ...tradeButtons });
}

// 监听按钮点击
bot.on("callback_query", async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const fromUser = ctx.callbackQuery.from.username
    ? `@${ctx.callbackQuery.from.username}`
    : ctx.callbackQuery.from.first_name;

  let textUpdate = "";

  if (callbackData === "trade_success") {
    textUpdate = `✔ 交易已成功！\n操作人: ${fromUser}\n时间: ${new Date().toLocaleString()}`;
  } else if (callbackData === "trade_cancel") {
    textUpdate = `❌ 交易已取消！\n操作人: ${fromUser}\n时间: ${new Date().toLocaleString()}`;
  }

  // 编辑原消息
  await ctx.editMessageText(textUpdate, { parse_mode: "Markdown" });

  // 回复按钮点击，防止 Telegram loading
  await ctx.answerCbQuery();
});

// 提供一个测试路由，通过 /trade POST 发送交易消息
import express from "express";
const app = express();
app.use(express.json());

app.post("/trade", async (req, res) => {
  const trade = req.body;
  if (!trade.tradeType || !trade.coin || !trade.amount || !trade.amountCurrency) {
    return res.status(400).send("Missing trade parameters");
  }
  try {
    await sendTradeMessage(trade);
    res.status(200).send("Trade sent ✅");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error sending trade");
  }
});

app.get("/", (req, res) => {
  res.send("Bot is running ✅");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// 启动轮询
bot.launch().then(() => console.log("Bot polling started ✅"));

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
