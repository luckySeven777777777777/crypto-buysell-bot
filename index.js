import express from "express";
import bodyParser from "body-parser";
import TelegramBot from "node-telegram-bot-api";

const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const app = express();
app.use(bodyParser.json());

// 已处理订单（禁止重复点击）
const processedOrders = new Set();

// ========== 接收 index.html 发送的订单 ==========

app.post("/trade", (req, res) => {
    const { orderId, coin, amount, amountCurrency, tradeType, time } = req.body;

    // 去掉 #，用于 callback_data
    const cleanId = orderId.replace("#", "");

    const text = 
`Type: ${tradeType.toUpperCase()}
Coin: ${coin}
Amount: ${amount} ${amountCurrency}
Time: ${time}`;

    bot.sendMessage(6062973135, text, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✔ 成功交易", callback_data: `success_${cleanId}` },
                    { text: "✖ 取消交易", callback_data: `cancel_${cleanId}` }
                ]
            ]
        }
    });

    res.sendStatus(200);
});

// ========== 按钮处理 ==========

bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const msg = query.message.text;

    let [action, id] = data.split("_");
    const orderId = "#" + id;

    // =====================
    // ❗ 阻止重复操作
    // =====================
    if (processedOrders.has(id)) {
        bot.answerCallbackQuery(query.id, { text: "⛔ 已处理过此订单", show_alert: true });
        return;
    }

    // 标记已处理
    processedOrders.add(id);

    // =====================
    // 从文本中解析币种与金额（兼容你当前纯文本格式）
    // =====================

    const coin = msg.match(/Coin:\s(.+)/)?.[1] || "Unknown";
    const amount = msg.match(/Amount:\s(.+)/)?.[1] || "Unknown";

    const time = new Date().toLocaleString();

    if (action === "success") {
        bot.sendMessage(chatId,
`✔ 交易成功！
🆔 订单编号: ${orderId}
币种: ${coin}
金额: ${amount}
时间: ${time}`);
    } else {
        bot.sendMessage(chatId,
`❌ 交易已取消！
🆔 订单编号: ${orderId}
币种: ${coin}
金额: ${amount}
时间: ${time}`);
    }

    // 按钮变灰 = 删除按钮
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id });
});

app.listen(8080, () => console.log("BOT Running on PORT 8080"));
