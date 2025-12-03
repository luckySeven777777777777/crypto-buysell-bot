const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

const TOKEN = process.env.BOT_TOKEN || "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = process.env.GROUP_ID || -1003262870745;
const ADMINS = process.env.ADMINS ? process.env.ADMINS.split(",") : [6062973135,7416199637,6615925197];

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// 保留你原来的 polling，不动
const bot = new TelegramBot(TOKEN, { polling: true });

let orderData = {};

bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const user = query.from.username ? `@${query.from.username}` : "Unknown";
    const data = query.data;

    if (!data) return;

    const [action, orderId] = data.split("_");
    const order = orderData[orderId];

    if (!order) {
        return bot.sendMessage(chatId, "订单不存在或已过期。");
    }

    if (order.handled) {
        return bot.sendMessage(chatId, "此订单已处理，不能重复点击。");
    }

    order.handled = true;

    if (action === "success") {
        bot.sendMessage(chatId,
`✔ 交易成功！
🆔 订单编号: ${orderId}
币种: ${order.coin}
金额: ${order.amount} ${order.amountCurrency}
操作人: ${user}
时间: ${order.time}`);
    }

    if (action === "cancel") {
        bot.sendMessage(chatId,
`❌ 交易已取消！
🆔 订单编号: ${orderId}
币种: ${order.coin}
金额: ${order.amount} ${order.amountCurrency}
操作人: ${user}
时间: ${order.time}`);
    }
});

// 前端发送订单 → 群通知
app.post("/trade", (req, res) => {
    const { orderId, coin, amount, amountCurrency, tradeType, time } = req.body;

    orderData[orderId] = { coin, amount, amountCurrency, time, handled:false };

    bot.sendMessage(GROUP_ID,
`📌 新订单请求
🆔 订单编号: ${orderId}

类型: ${tradeType.toUpperCase()}
币种: ${coin}
金额: ${amount} ${amountCurrency}
时间: ${time}`,
    {
        reply_markup: {
            inline_keyboard: [
                [
                    { text:"✔ 成功交易", callback_data:`success_${orderId}` },
                    { text:"✖ 取消交易", callback_data:`cancel_${orderId}` }
                ]
            ]
        }
    });

    res.sendStatus(200);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("BOT Running on PORT", PORT));
