const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const ADMINS = [6062973135, 7416199637, 6615925197];

console.log("BOT Running...");

// =============== 处理按钮回调 ===============

bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const user = query.from.username ? `@${query.from.username}` : query.from.first_name;

    // 从 callback_data 解析订单号
    const orderId = data.split("_")[1] || "Unknown";

    // 原始下单消息
    const text = query.message.text;

    // 正则解析
    const coin = text.match(/Coin:\s\*(.+?)\*/)?.[1] || "Unknown";
    const amount = text.match(/Amount:\s\*(.+?)\*/)?.[1] || "Unknown";

    const now = new Date().toLocaleString();

    // 成交
    if (data.startsWith("success_")) {
        bot.sendMessage(chatId,
`✔ *交易成功！*
🆔 订单编号: *${orderId}*
币种: *${coin}*
金额: *${amount}*
操作人: ${user}
时间: ${now}`,
        { parse_mode: "Markdown" });
    }

    // 取消
    if (data.startsWith("cancel_")) {
        bot.sendMessage(chatId,
`✖ *交易已取消！*
🆔 订单编号: *${orderId}*
币种: *${coin}*
金额: *${amount}*
操作人: ${user}
时间: ${now}`,
        { parse_mode: "Markdown" });
    }
});
