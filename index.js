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

// === 环境变量 ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = Number(process.env.GROUP_ID);
const PRIVATE_ID = Number(process.env.PRIVATE_ID);
const ADMINS = (process.env.ADMINS || "").split(",").map(id => Number(id.trim()));
const MAX_AMOUNT = Number(process.env.MAX_AMOUNT || 5000);

console.log("Loaded ADMINS:", ADMINS);

// 初始化机器人（polling）
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// /id — 获取当前 chat ID
bot.on("message", async (msg) => {
    if (msg.text === "/id") {
        bot.sendMessage(msg.chat.id, `🔍 本聊天的 ID：\`${msg.chat.id}\``, {
            parse_mode: "Markdown"
        });
    }
});

// 保存操作记录（避免重复操作）
const actionMap = new Map(); // message_id → admin_id

// ============= 按钮菜单（最终版）==============
function tradeButtons() {
    return {
        inline_keyboard: [
            [
                { text: "✔️ 成功交易", callback_data: "trade_success" },
                { text: "✖️ 取消交易", callback_data: "trade_cancel" }
            ],
            [
                { text: "🔒 锁单", callback_data: "lock" },
                { text: "🔓 解锁", callback_data: "unlock" }
            ],
            [
                { text: "🟩 审核通过", callback_data: "approve" },
                { text: "🟥 审核拒绝", callback_data: "reject" }
            ]
        ]
    };
}

// ============= 自动风控检测 =============
function checkRisk(amount) {
    if (amount >= MAX_AMOUNT) {
        return `⚠️ *风险预警：交易金额过大（${amount} USDT）*\n系统已自动提示管理员审核。`;
    }
    return null;
}


// ================== 发送交易 ==================
async function sendTradeMessage(trade) {
    const msg =
        `📣 *New Trade Request*\n` +
        `Type: *${trade.tradeType.toUpperCase()}*\n` +
        `Coin: *${trade.coin}*\n` +
        `Amount: *${trade.amount} ${trade.amountCurrency}*\n` +
        `TP: *${trade.tp || "None"}*\n` +
        `SL: *${trade.sl || "None"}*\n` +
        `Time: ${new Date().toLocaleString()}`;

    const options = {
        parse_mode: "Markdown",
        reply_markup: tradeButtons()
    };

    // 推送到群
    const groupMsg = await bot.sendMessage(GROUP_ID, msg, options);
    // 推送到管理员私聊
    const adminMsg = await bot.sendMessage(PRIVATE_ID, msg, options);

    // 所有管理员都要收到
    for (const adminID of ADMINS) {
        bot.sendMessage(adminID, msg, options);
    }

    // 风控提示
    const warn = checkRisk(Number(trade.amount));
    if (warn) {
        bot.sendMessage(GROUP_ID, warn, { parse_mode: "Markdown" });
        for (const adminID of ADMINS) bot.sendMessage(adminID, warn, { parse_mode: "Markdown" });
    }

    // 缓存 message id → 还未操作
    actionMap.set(groupMsg.message_id, null);
    actionMap.set(adminMsg.message_id, null);
}
// =================== 处理按钮点击 ===================
bot.on("callback_query", async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const userId = query.from.id;

    // 提取消息内容
    const text = query.message.text;
    const coin = (text.match(/Coin:\s\*?(.*?)\*/)||["","Unknown"])[1];
    const amount = (text.match(/Amount:\s\*?(.*?)\*/)||["","Unknown"])[1];

    const operator = query.from.username
        ? `@${query.from.username}`
        : query.from.first_name;

    // 防重复操作
    const prev = actionMap.get(msgId);
    if (prev && prev !== userId) {
        return bot.answerCallbackQuery(query.id, {
            text: "此订单已经被其他管理员操作！",
            show_alert: true
        });
    }
    actionMap.set(msgId, userId);

    let result = "";

    // =================== 按钮对应功能 ===================
    switch (data) {
        case "success":
            result =
                `✔️ *交易已成功*\n\n` +
                `币种：*${coin}*\n` +
                `金额：*${amount}*\n` +
                `操作人：${operator}\n` +
                `时间：${new Date().toLocaleString()}`;
            break;

        case "cancel":
            result =
                `❌ *交易已取消*\n\n` +
                `币种：*${coin}*\n` +
                `金额：*${amount}*\n` +
                `操作人：${operator}\n` +
                `时间：${new Date().toLocaleString()}`;
            break;

        case "lock":
            result =
                `🔒 *订单已锁定（Stop Processing）*\n` +
                `管理员：${operator}`;
            break;

        case "unlock":
            result =
                `🔓 *订单已解锁（Resume Processing）*\n` +
                `管理员：${operator}`;
            break;

        case "approve":
            result =
                `🟢 *订单审核通过*\n` +
                `管理员：${operator}`;
            break;

        default:
            return;
    }

    // 修改当前消息
    bot.editMessageText(result, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: "Markdown"
    });

    bot.answerCallbackQuery(query.id);

    // 同步给其他管理员
    for (const adminID of ADMINS) {
        if (adminID !== chatId)
            bot.sendMessage(adminID, result, { parse_mode: "Markdown" });
    }

    // 同步到群
    if (chatId !== GROUP_ID)
        bot.sendMessage(GROUP_ID, result, { parse_mode: "Markdown" });
});


// =========== 前端 /trade 调用接口 ===========
app.post("/trade", async (req, res) => {
    try {
        await sendTradeMessage(req.body);
        res.send("Trade sent.");
    } catch (err) {
        console.error(err);
        res.status(500).send("error");
    }
});


// =========== 首页 ===========
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});


// =========== 启动服务器 ===========
app.listen(PORT, () => {
    console.log(`🚀 Bot server running on port ${PORT}`);
});
