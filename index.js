import express from "express";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

// =====================================
// 配置
// =====================================
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";

// 私聊 + 群（管理员列表）
const ADMINS = [
    6062973135,        // 你的私聊
    -1003262870745,    // 群
];

// 保存当前订单按钮
let pendingMessages = [];   // { chatId, messageId }

// 是否已被点击（锁）
let orderLock = false;

let ORDER_ID = 10001;

// 日志文件
const LOG_FILE = "logs.txt";
function writeLog(text) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toLocaleString()}] ${text}\n`);
}

// Telegram polling
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// =====================================
// Express 后端
// =====================================
const app = express();
app.use(express.json());

app.post("/trade", async (req, res) => {

    const data = req.body;
    const orderId = ORDER_ID++;
    orderLock = false;     // 解锁新订单
    pendingMessages = [];  // 清空旧订单按钮

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
            console.log("发送失败（可能群没加机器人或权限不足）", e.message);
        }
    }

    writeLog(`订单创建：#${orderId}`);

    res.json({ ok: true });
});

// =====================================
// 按钮回调：只能点击一次
// =====================================
bot.on("callback_query", async (query) => {
    const action = query.data.split("_")[0];  
    const orderId = query.data.split("_")[1];
    const operator = query.from.first_name || "Admin";

    // 阻止重复点击
    if (orderLock) {
        bot.answerCallbackQuery(query.id, {
            text: "此订单已处理过！",
            show_alert: true
        });
        return;
    }

    // 开启锁（禁止后续任何点击）
    orderLock = true;

    let finalMessage = "";

    if (action === "ok") {
        finalMessage =
`✔ *交易已确认成功*
🆔 Order ID: ${orderId}
操作者: ${operator}`;
    } else {
        finalMessage =
`✖ *交易已取消*
🆔 Order ID: ${orderId}
操作者: ${operator}`;
    }

    // 1️⃣ 广播处理结果（群 + 私聊）
    for (const adminId of ADMINS) {
        try {
            await bot.sendMessage(adminId, finalMessage, {
                parse_mode: "Markdown"
            });
        } catch (e) {}
    }

    // 2️⃣ 删除所有订单按钮
    for (const msg of pendingMessages) {
        try {
            await bot.editMessageReplyMarkup(
                { inline_keyboard: [] },
                {
                    chat_id: msg.chatId,
                    message_id: msg.messageId
                }
            );
        } catch (e) {}
    }

    writeLog(`订单处理：#${orderId} → ${action} by ${operator}`);

    bot.answerCallbackQuery(query.id);
});

// =====================================
app.listen(3000, () => {
    console.log("🚀 Server running on port 3000");
});
