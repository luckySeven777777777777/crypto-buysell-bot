import express from "express";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// 配置（你提供的）
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = -1003262870745;     // 群组
const PRIVATE_ID = 6062973135;       // 你的管理员

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 防重复操作
const actionMap = new Map();

// ============= 发送订单到群组 + 管理员 ==============
async function sendTradeMessage(data) {

    const msg = `
📣 *New Trade Request*
🆔 订单编号: *${data.orderId}*

Type: *${data.tradeType.toUpperCase()}*
Coin: *${data.coin}*
Amount: *${data.amount} ${data.amountCurrency}*
TP: *${data.tp}*
SL: *${data.sl}*

Time: ${new Date().toLocaleString()}
    `;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "✔ 成功交易", callback_data: `success_${data.orderId}` },
                { text: "✖ 取消交易",  callback_data: `cancel_${data.orderId}` }
            ]
        ]
    };

    const opt = { parse_mode: "Markdown", reply_markup: keyboard };

    const g = await bot.sendMessage(GROUP_ID, msg, opt);
    const p = await bot.sendMessage(PRIVATE_ID, msg, opt);

    actionMap.set(g.message_id, null);
    actionMap.set(p.message_id, null);
}

// ============= 回调按钮处理（成功/取消） ==============
bot.on("callback_query", async (cb) => {
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    const user = cb.from.username ? `@${cb.from.username}` : cb.from.first_name;
    const data = cb.data; // success_123456

    let action = null;
    let orderId = null;

    if (data.startsWith("success_")) {
        action = "success";
        orderId = data.replace("success_", "");
    } else if (data.startsWith("cancel_")) {
        action = "cancel";
        orderId = data.replace("cancel_", "");
    }

    // 防重复
    const prev = actionMap.get(messageId);
    if (prev && prev !== cb.from.id) {
        return bot.answerCallbackQuery(cb.id, {
            text: "此订单已被其他管理员处理。",
            show_alert: true
        });
    }
    if (prev === cb.from.id) {
        return bot.answerCallbackQuery(cb.id, {
            text: "你已经操作过了。",
            show_alert: true
        });
    }

    actionMap.set(messageId, cb.from.id);

    // 提取币种/金额（兼容格式）
    const text = cb.message.text;
    const coinMatch = text.match(/Coin:\s\*?(.+?)\*/);
    const amountMatch = text.match(/Amount:\s\*?(.+?)\*/);

    const coin = coinMatch ? coinMatch[1] : "Unknown";
    const amount = amountMatch ? amountMatch[1] : "Unknown";

    let finalText = "";
    if (action === "success") {
        finalText = `✔️ *交易已成功！*\n`;
    } else {
        finalText = `❌ *交易已取消！*\n`;
    }

    finalText += `🆔 订单编号: *${orderId}*\n币种: *${coin}*\n金额: *${amount}*\n操作人: ${user}\n时间: ${new Date().toLocaleString()}`;

    await bot.editMessageText(finalText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] }
    });

    await bot.answerCallbackQuery(cb.id);
});

// ========== 前端 /trade API ==========
app.post("/trade", async (req, res) => {
    try {
        await sendTradeMessage(req.body);
        res.send("OK");
    } catch (e) {
        console.error(e);
        res.status(500).send("ERR");
    }
});

app.listen(PORT, () => console.log("BOT Running on PORT", PORT));
