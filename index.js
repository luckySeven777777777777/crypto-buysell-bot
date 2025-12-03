const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log("BOT RUNNING...");

// 修正：订单号 callback_data 中不能有 “#” → 去掉 #
function cleanOrderId(id) {
    return id.replace("#", "");
}

bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // 从 callback_data 中分离操作类型 + 订单号
    let [action, rawOrderId] = data.split("_");

    // 去掉 #（避免 null / unknown）
    const orderId = "#" + cleanOrderId(rawOrderId);

    // 解析原始信息
    const text = query.message.text;

    const coin = text.match(/Coin:\s\*(.+?)\*/)?.[1] || "Unknown";
    const amount = text.match(/Amount:\s\*(.+?)\*/)?.[1] || "Unknown";

    const now = new Date().toLocaleString();

    // ================= 成功交易 =================
    if (action === "success") {
        bot.sendMessage(
            chatId,
            `✔ *交易成功！*
🆔 订单编号: *${orderId}*
币种: *${coin}*
金额: *${amount}*
时间: ${now}`,
            { parse_mode: "Markdown" }
        );
    }

    // ================= 取消交易 =================
    if (action === "cancel") {
        bot.sendMessage(
            chatId,
            `❌ *交易已取消！*
🆔 订单编号: *${orderId}*
币种: *${coin}*
金额: *${amount}*
时间: ${now}`,
            { parse_mode: "Markdown" }
        );
    }
});
