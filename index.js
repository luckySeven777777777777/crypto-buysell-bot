import express from "express";
import TelegramBot from "node-telegram-bot-api";

const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";

// 管理员列表
const ADMINS = [
    6062973135,        // 私人
    -1003262870745     // 群
];

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let ORDER_ID = 10001;
let pendingOrders = {}; 
// pendingOrders[orderId] = { messages: [{chatId,messageId}], locked: false }

const app = express();
app.use(express.json());

// 创建新订单
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
            pendingOrders[orderId].messages.push({ chatId: sent.chat.id, messageId: sent.message_id });
        } catch (e) {
            console.log(`发送到 ${chatId} 失败:`, e.response?.description || e.message);
        }
    }

    res.json({ ok: true });
});

// 每笔订单独立处理点击
bot.on("callback_query", async (query) => {
    const [action, orderIdStr] = query.data.split("_");
    const orderId = parseInt(orderIdStr);
    const operator = query.from.first_name || "管理员";
    const userId = query.from.id;

    // 只允许管理员点击
    if (!ADMINS.includes(userId)) {
        await bot.answerCallbackQuery(query.id, { text: "只有管理员可以操作订单", show_alert: true });
        return;
    }

    const order = pendingOrders[orderId];
    if (!order) {
        await bot.answerCallbackQuery(query.id, { text: "订单不存在或已过期", show_alert: true });
        return;
    }

    // 每笔订单独立锁定
    if (order.locked) {
        await bot.answerCallbackQuery(query.id, { text: "此订单已处理过", show_alert: true });
        return;
    }

    order.locked = true; // 锁定本订单

    const finalText = action === "ok"
        ? `✔ *交易已确认成功*\n🆔 Order ID: ${orderId}\n操作者: ${operator}`
        : `✖ *交易已取消*\n🆔 Order ID: ${orderId}\n操作者: ${operator}`;

    // 删除本订单按钮
    for (const msg of order.messages) {
        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: msg.chatId,
                message_id: msg.messageId
            });
        } catch (e) {
            console.log("删除按钮失败:", e.message);
        }
    }

    // 群 + 私人通知处理结果
    for (const chatId of ADMINS) {
        try {
            await bot.sendMessage(chatId, finalText, { parse_mode: "Markdown" });
        } catch (e) {
            console.log(`发送处理结果到 ${chatId} 失败:`, e.message);
        }
    }

    await bot.answerCallbackQuery(query.id);
});

app.listen(3000, () => console.log("🚀 Server running on port 3000"));
