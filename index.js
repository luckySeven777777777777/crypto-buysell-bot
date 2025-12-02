import express from "express";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

// =====================================
// 配置
// =====================================
const BOT_TOKEN = "你的BOT_TOKEN";

const ADMINS = [
    6062973135,        // 私人
    -1003262870745     // 群
];

// 日志文件
const LOG_FILE = "logs.txt";
function writeLog(text) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toLocaleString()}] ${text}\n`);
}

// Telegram polling
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// =====================================
// 数据结构
// =====================================
let ORDER_ID = 10001;
let pendingMessages = []; 
// { chatId, messageId, orderId }
let orderLocks = {}; 
// { orderId: true/false }

// =====================================
// Express 后端
// =====================================
const app = express();
app.use(express.json());

app.post("/trade", async (req, res) => {
    const data = req.body;
    const orderId = ORDER_ID++;
    orderLocks[orderId] = false;

    const msg =
`📣 *New Trade Request*
━━━━━━━━━━━━━━
🆔 *Order ID*: ${orderId}
📝 Type: *${data.type.toUpperCase()}*
💰 Coin: *${data.coin}*
🔢 Amount: *${data.amount} ${data.amountCurrency}*
🎯 TP: *${data.tp}*
🛑 SL: *${data.sl}*
⏰ Time: ${data.time}
━━━━━━━━━━━━━━`;

    pendingMessages = pendingMessages.filter(m => m.orderId !== orderId); // 清理旧订单

    for (const adminId of ADMINS) {
        try {
            const sent = await bot.sendMessage(adminId, msg, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✔ 成功交易", callback_data: `ok_${orderId}` },
                            { text: "✖ 取消交易", callback_data: `cancel_${orderId}` }
                        ]
                    ]
                }
            });

            pendingMessages.push({
                chatId: sent.chat.id,
                messageId: sent.message_id,
                orderId
            });
        } catch (e) {
            console.log("发送失败:", e.message);
        }
    }

    writeLog(`订单创建：#${orderId}`);
    res.json({ ok: true });
});

// =====================================
// 按钮回调处理
// =====================================
bot.on("callback_query", async (query) => {
    const [action, orderId] = query.data.split("_");
    const operator = query.from.first_name || "Admin";

    // 单订单锁
    if (orderLocks[orderId]) {
        bot.answerCallbackQuery(query.id, {
            text: "此订单已处理过！",
            show_alert: true
        });
        return;
    }
    orderLocks[orderId] = true;

    // 生成最终消息
    const finalMessage = action === "ok"
        ? `✔ *交易已确认成功*\n🆔 Order ID: ${orderId}\n操作者: ${operator}`
        : `✖ *交易已取消*\n🆔 Order ID: ${orderId}\n操作者: ${operator}`;

    // 1️⃣ 删除按钮
    for (const msg of pendingMessages.filter(m => m.orderId == orderId)) {
        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: msg.chatId,
                message_id: msg.messageId
            });
        } catch (e) {}
    }

    // 2️⃣ 给所有管理员（私人+群）发送最终消息
    for (const adminId of ADMINS) {
        try {
            await bot.sendMessage(adminId, finalMessage, { parse_mode: "Markdown" });
        } catch (e) {}
    }

    writeLog(`订单处理：#${orderId} → ${action} by ${operator}`);
    bot.answerCallbackQuery(query.id);
});

// =====================================
app.listen(3000, () => {
    console.log("🚀 Server running on port 3000");
});
