import express from "express";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = process.env.GROUP_ID;
const ADMINS = process.env.ADMINS ? process.env.ADMINS.split(",") : [];

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

let orderData = {};

// 使用 webhook（替代 polling）
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`https://crypto-buysell-bot-production.up.railway.app/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// 处理按钮回调
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
时间: ${order.time}`
        );
    }

    if (action === "cancel") {
        bot.sendMessage(chatId,
`❌ 交易已取消！
🆔 订单编号: ${orderId}
币种: ${order.coin}
金额: ${order.amount} ${order.amountCurrency}
操作人: ${user}
时间: ${order.time}`
        );
    }
});

// 前端 sendTrade → Telegram 群组
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
app.listen(PORT, () => console.log("Webhook server running:", PORT));
