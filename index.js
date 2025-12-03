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

// === ENV VARIABLES ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = Number(process.env.GROUP_ID);
const PRIVATE_ID = Number(process.env.PRIVATE_ID);

// 多管理员（从环境变量解析）
const ADMINS = process.env.ADMINS
    ? process.env.ADMINS.split(",").map(n => Number(n.trim()))
    : [PRIVATE_ID];

// 自动风控金额
const MAX_AMOUNT = Number(process.env.MAX_AMOUNT) || 5000;

// === INIT BOT (POLLING) ===
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === /id 指令 ===
bot.on("message", async (msg) => {
    if (msg.text === "/id") {
        bot.sendMessage(msg.chat.id, `🔍 Chat ID: \`${msg.chat.id}\``, {
            parse_mode: "Markdown"
        });
    }
});

// === 订单状态记录 ===
const orderStatus = new Map(); // message_id → { locked, operator }

// === INLINE BUTTONS ===
function createButtons(isLocked) {
    if (isLocked) {
        return {
            inline_keyboard: [
                [{ text: "🔓 解锁订单", callback_data: "unlock_order" }],
                [
                    { text: "✔️ 审核通过", callback_data: "approve_order" },
                    { text: "❌ 审核拒绝", callback_data: "reject_order" }
                ]
            ]
        };
    }

    return {
        inline_keyboard: [
            [{ text: "🔒 锁定订单", callback_data: "lock_order" }],
            [
                { text: "✔️ 成功交易", callback_data: "trade_success" },
                { text: "✖️ 取消交易", callback_data: "trade_cancel" }
            ]
        ]
    };
}

// === 发送订单信息 ===
async function sendTradeMessage(trade) {
    const risk = Number(trade.amount) >= MAX_AMOUNT ? "⚠️ *High Risk Order*\n" : "";

    const text =
`📣 *New Trade Request*
Coin: *${trade.coin}*
Amount: *${trade.amount} ${trade.amountCurrency}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
${risk}
Time: ${new Date().toLocaleString()}`;

    const opts = {
        parse_mode: "Markdown",
        reply_markup: createButtons(false)
    };

    // 群
    const groupMsg = await bot.sendMessage(GROUP_ID, text, opts);

    // 私聊
    const privateMsg = await bot.sendMessage(PRIVATE_ID, text, opts);

    orderStatus.set(groupMsg.message_id, { locked: false });
    orderStatus.set(privateMsg.message_id, { locked: false });
}

// === 按键回调 ===
bot.on("callback_query", async (q) => {
    const msg = q.message;
    const mid = msg.message_id;
    const uid = q.from.id;

    // 权限
    if (!ADMINS.includes(uid)) {
        return bot.answerCallbackQuery(q.id, {
            text: "❌ 无权限操作",
            show_alert: true
        });
    }

    const status = orderStatus.get(mid) || { locked: false };

    // === 锁单 ===
    if (q.data === "lock_order") {
        orderStatus.set(mid, { locked: true, operator: uid });

        await bot.editMessageReplyMarkup(createButtons(true), {
            chat_id: msg.chat.id,
            message_id: mid
        });

        return bot.answerCallbackQuery(q.id, { text: "🔒 已锁单" });
    }

    // === 解锁 ===
    if (q.data === "unlock_order") {
        orderStatus.set(mid, { locked: false, operator: null });

        await bot.editMessageReplyMarkup(createButtons(false), {
            chat_id: msg.chat.id,
            message_id: mid
        });

        return bot.answerCallbackQuery(q.id, { text: "🔓 已解锁" });
    }

    // === 审核通过 ===
    if (q.data === "approve_order") {
        await bot.editMessageText(
            `✅ *订单审核通过*
操作人：${q.from.first_name}
时间：${new Date().toLocaleString()}`,
            { chat_id: msg.chat.id, message_id: mid, parse_mode: "Markdown" }
        );
        return bot.answerCallbackQuery(q.id, { text: "审核成功" });
    }

    // === 审核拒绝 ===
    if (q.data === "reject_order") {
        await bot.editMessageText(
            `❌ *订单审核拒绝*
操作人：${q.from.first_name}
时间：${new Date().toLocaleString()}`,
            { chat_id: msg.chat.id, message_id: mid, parse_mode: "Markdown" }
        );
        return bot.answerCallbackQuery(q.id, { text: "已拒绝" });
    }

    // === 原本的成功 / 取消 ===
    if (q.data === "trade_success" || q.data === "trade_cancel") {

        if (status.locked) {
            return bot.answerCallbackQuery(q.id, {
                text: "⚠️ 订单已锁定，无法操作",
                show_alert: true
            });
        }

        const result =
            q.data === "trade_success"
                ? "✔️ *交易已成功*"
                : "❌ *交易已取消*";

        await bot.editMessageText(
            `${result}
操作人：${q.from.first_name}
时间：${new Date().toLocaleString()}`,
            { chat_id: msg.chat.id, message_id: mid, parse_mode: "Markdown" }
        );

        return bot.answerCallbackQuery(q.id);
    }
});

// === FOR FRONT-END ===
app.post("/trade", async (req, res) => {
    try {
        await sendTradeMessage(req.body);
        res.status(200).send("OK");
    } catch (err) {
        console.error(err);
        res.status(500).send("ERR");
    }
});

// === ROOT ===
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
