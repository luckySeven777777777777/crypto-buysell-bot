import express from "express";
import TelegramBot from "node-telegram-bot-api";

// ==========================
// 配置
// ==========================
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const ADMINS = [
    6062973135,        // 私人
    -1003262870745     // 群（超级群）
];

// ==========================
// Telegram Bot (Polling)
// ==========================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ==========================
// 数据结构
// ==========================
let ORDER_ID = 10001;
let pendingOrders = {}; 
// 结构： { orderId: { messages: [{chatId,messageId}], locked: false } }

// ==========================
// Express 后端
// ==========================
const app = express();
app.use(express.json());

app.post("/trade", async (req, res) => {
    const data = req.body;
    const orderId = ORDER_ID++;

    pendingOrders[orderId] = { messages: [], locked: false };

    const text = 
`📣 *新订单*
🆔 Order ID: ${orderId}
📝 Type: ${data.type.toUpperCase()}
💰 Coin: ${data.coin}
🔢 Amount: ${data.amount} ${data.amountCurrency}
🎯 TP: ${data.tp}
🛑 SL: ${data.sl}
⏰ Time: ${data.time}`;

    // 发送给私人 + 群
    for (const chatId of ADMINS) {
        try {
            const sent = await bot.sendMessage(chatId, text, {
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

            pendingOrders[orderId].messages.push({
                chatId: sent.chat.id,
                messageId: sent.message_id
            });
        } catch (e) {
            console.log(`发送到 ${chatId} 失败:`, e.response?.description || e.message);
        }
    }

    res.json({ ok: true });
});

// ==========================
// 按钮回调处理
// ==========================
bot.on("callback_query", async (query) => {
    const [action, orderIdStr] = query.data.split("_");
    const orderId = parseInt(orderIdStr);
    const operator = query.from.first_name || "管理员";

    const order = pendingOrders[orderId];
    if (!order) {
        await bot.answerCallbackQuery(query.id, { text: "订单不存在或已过期", show_alert: true });
        return;
    }

    if (order.locked) {
        await bot.answerCallbackQuery(query.id, { text: "此订单已处理过", show_alert: true });
        return;
    }

    order.locked = true; // 锁定订单，禁止重复点击

    const finalText = action === "ok"
        ? `✔ *交易已确认成功*\n🆔 Order ID: ${orderId}\n操作者: ${operator}`
        : `✖ *交易已取消*\n🆔 Order ID: ${orderId}\n操作者: ${operator}`;

    // 1️⃣ 删除按钮（点击后自动消失）
    for (const msg of order.messages) {
        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: msg.chatId,
                message_id: msg.messageId
            });
        } catch (e) {}
    }

    // 2️⃣ 同步发送最终消息给私人 + 群
    for (const chatId of ADMINS) {
        try {
            await bot.sendMessage(chatId, finalText, { parse_mode: "Markdown" });
        } catch (e) {}
    }

    await bot.answerCallbackQuery(query.id); // ✅ 必须答复 callback_query，否则按钮会灰掉
});

// ==========================
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
