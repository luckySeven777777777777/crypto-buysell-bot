import express from "express";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 8080;

// === 你的机器人配置 ===
const BOT_TOKEN = process.env.BOT_TOKEN || "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = Number(process.env.GROUP_ID) || -1003262870745;
const PRIVATE_ID = Number(process.env.PRIVATE_ID) || 6062973135;

// ⭐⭐⭐ 新增：多管理员
const ADMINS = [
    PRIVATE_ID,        // 主管理员（你）
    7416199637,        // 管理员 2
    6615925197         // 管理员 3
];

// 初始化机器人（polling 模式）
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// =======================================
// /id 指令 — 显示当前聊天的真实 chat.id
// =======================================
bot.on("message", async (msg) => {
    if (msg.text === "/id") {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `🔍 本聊天的 ID 是：\`${chatId}\``, {
            parse_mode: "Markdown"
        });
    }
});

// 保存已操作用户
const actionMap = new Map(); // message_id -> user_id

function createInlineKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: "✔️ 成功交易", callback_data: "trade_success" },
                { text: "✖️ 取消交易", callback_data: "trade_cancel" }
            ]
        ]
    };
}

// 发送交易信息
async function sendTradeMessage(trade) {
    const msg = `📣 *New Trade Request*
Type: *${trade.tradeType.toUpperCase()}*
Coin: *${trade.coin}*
Amount: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
Time: ${new Date().toLocaleString()}
`;

    const options = {
        parse_mode: "Markdown",
        reply_markup: createInlineKeyboard(),
    };

    // 发群
    const groupMsg = await bot.sendMessage(GROUP_ID, msg, options);

    // 发给你私人
    const privateMsg = await bot.sendMessage(PRIVATE_ID, msg, options);

    actionMap.set(groupMsg.message_id, null);
    actionMap.set(privateMsg.message_id, null);
}

// 按钮点击
bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;

    // ⭐⭐⭐ 新增多管理员权限判断
    if (!ADMINS.includes(userId)) {
        return bot.answerCallbackQuery(callbackQuery.id, {
            text: "❌ 你没有权限操作此订单",
            show_alert: true
        });
    }

    const text = callbackQuery.message.text;

    const coin = (text.match(/Coin:\s\*?(.*?)\*?\n/) || [])[1] || "Unknown";
    const amount = (text.match(/Amount:\s\*?(.*?)\*?\n/) || [])[1] || "Unknown";

    const operator = callbackQuery.from.username
        ? `@${callbackQuery.from.username}`
        : callbackQuery.from.first_name;

    // 防止重复操作
    const already = actionMap.get(messageId);
    if (already && already !== userId) {
        return bot.answerCallbackQuery(callbackQuery.id, {
            text: "此交易已被其他管理员处理。",
            show_alert: true,
        });
    }
    if (already === userId) {
        return bot.answerCallbackQuery(callbackQuery.id, {
            text: "你已经操作过了。",
            show_alert: true,
        });
    }

    actionMap.set(messageId, userId);

    let resultText = "";

    if (callbackQuery.data === "trade_success") {
        resultText = `✔️ *交易已成功！*
币种: *${coin}*
金额: *${amount}*
操作人: ${operator}
时间: ${new Date().toLocaleString()}`;
    } else {
        resultText = `❌ *交易已取消！*
币种: *${coin}*
金额: *${amount}*
操作人: ${operator}
时间: ${new Date().toLocaleString()}`;
    }

    await bot.editMessageText(resultText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] },
    });

    await bot.answerCallbackQuery(callbackQuery.id);
});

// 前端发送 /trade 请求
app.post("/trade", async (req, res) => {
    try {
        const trade = req.body;
        await sendTradeMessage(trade);
        res.status(200).send("Trade sent successfully");
    } catch (e) {
        console.error(e);
        res.status(500).send("Error");
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// 启动服务
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
