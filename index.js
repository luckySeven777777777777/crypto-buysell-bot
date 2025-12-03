const TelegramBot = require("node-telegram-bot-api");

// =============================
// 配置
// =============================
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const ADMINS = [6062973135, 7416199637, 6615925197];

console.log("BOT Running...");

// =============================
// 处理按钮 callback
// =============================
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const msgText = query.message.text;

    const user =
        query.from.username
            ? `@${query.from.username}`
            : query.from.first_name;

    // 订单号解析：去掉 Markdown 星号
    const orderId = data.split("_")[1].replace(/\*/g, "") || "Unknown";

    // 按 index.html 的格式解析币种
    const coin = msgText.match(/Coin:\s\*(.+?)\*/) ? msgText.match(/Coin:\s\*(.+?)\*/)[1] : "Unknown";

    // 金额（例如 "1000 USDT"）
    const amount = msgText.match(/Amount:\s\*(.+?)\*/) ? msgText.match(/Amount:\s\*(.+?)\*/)[1] : "Unknown";

    const now = new Date().toLocaleString();

    // =============================
    // 交易成功
    // =============================
    if (data.startsWith("success_")) {
        bot.sendMessage(
            chatId,
            `✔ *交易成功！*
🆔 订单编号: *${orderId}*
币种: *${coin}*
金额: *${amount}*
操作人: ${user}
时间: ${now}`,
            { parse_mode: "Markdown" }
        );
    }

    // =============================
    // 交易取消
    // =============================
    if (data.startsWith("cancel_")) {
        bot.sendMessage(
            chatId,
            `✖ *交易已取消！*
🆔 订单编号: *${orderId}*
币种: *${coin}*
金额: *${amount}*
操作人: ${user}
时间: ${now}`,
            { parse_mode: "Markdown" }
        );
    }
});
