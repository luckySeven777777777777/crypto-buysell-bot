import express from "express";
import bodyParser from "body-parser";
import TelegramBot from "node-telegram-bot-api";

const app = express();
app.use(bodyParser.json());

const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 禁止重复点击
const processedOrders = new Set();

// ===========================
// 收到前端订单
// ===========================
app.post("/trade", (req, res) => {
    const { orderId, coin, amount, amountCurrency, tradeType, time } = req.body;

    const cleanId = orderId.replace("#", ""); // 用于 callback_data

    const msg =
`Type: ${tradeType.toUpperCase()}
Coin: ${coin}
Amount: ${amount} ${amountCurrency}
Time: ${time}`;

    bot.sendMessage(6062973135, msg, {
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

// ===========================
// 按钮处理（成功 / 取消）
// ===========================
bot.on("callback_query", (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    const msg = q.message.text;

    const [action, id] = data.split("_");
    const orderId = "#" + id;

    // 阻止重复点击
    if (processedOrders.has(id)) {
        bot.answerCallbackQuery(q.id, { text: "⛔ 已处理过此订单", show_alert: true });
        return;
    }
    processedOrders.add(id);

    // 解析币种金额
    const coin = msg.match(/Coin:\s(.+)/)?.[1] || "Unknown";
    const amount = msg.match(/Amount:\s(.+)/)?.[1] || "Unknown";

    const time = new Date().toLocaleString();

    if(action === "success"){
        bot.sendMessage(chatId,
`✔ 交易成功！
🆔 订单编号：${orderId}
币种：${coin}
金额：${amount}
时间：${time}`);
    } else {
        bot.sendMessage(chatId,
`❌ 交易已取消！
🆔 订单编号：${orderId}
币种：${coin}
金额：${amount}
时间：${time}`);
    }

    // 删除按钮，防止再次点击
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: chatId,
        message_id: q.message.message_id
    });
});

app.listen(8080, () => console.log("BOT Running on 8080"));
