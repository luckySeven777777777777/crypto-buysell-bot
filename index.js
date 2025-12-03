//---------------------------------------------
// 读取环境变量
//---------------------------------------------
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// 环境变量
const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = process.env.GROUP_ID;              // 群ID
const OWNER_ID = process.env.PRIVATE_ID;            // 主管理员（你）
const ADMINS = [
    OWNER_ID,
    "6615925197",   // 新管理员 1
    "7416199637"    // 新管理员 2
];

//---------------------------------------------
// 创建机器人
//---------------------------------------------
const bot = new TelegramBot(BOT_TOKEN, {
    polling: true
});

//---------------------------------------------
// 建立 Express
//---------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => res.sendFile("index.html", { root: __dirname }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on", PORT));


//-------------------------------------------------------
// 工具函数：发送订单消息到 群 + 私聊
//-------------------------------------------------------
function sendOrderToAll(text, keyboard) {
    // 1. 群
    bot.sendMessage(GROUP_ID, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard
    });

    // 2. 每个管理员私聊
    ADMINS.forEach(admin => {
        bot.sendMessage(admin, text, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    });
}


//-------------------------------------------------------
// 检查权限
//-------------------------------------------------------
function isAdmin(id) {
    return ADMINS.includes(String(id));
}


//-------------------------------------------------------
// 新订单（来自前端）
//-------------------------------------------------------
app.post("/trade", async (req, res) => {
    const data = req.body;

    const msg =
`📣 *New Trade Request*
-----------------------
📌 *Type:* ${data.type}
📌 *Coin:* ${data.coin}
📌 *Amount:* ${data.amount} ${data.currency}
📌 *TP:* ${data.tp}
📌 *SL:* ${data.sl}
⏰ *Time:* ${data.time}
-----------------------`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "🔒 锁单", callback_data: "lock" },
                { text: "🔓 解锁单", callback_data: "unlock" }
            ],
            [
                { text: "✅ 到账确认", callback_data: "confirm" },
                { text: "❌ 取消订单", callback_data: "cancel" }
            ]
        ]
    };

    sendOrderToAll(msg, keyboard);

    res.json({ ok: true });
});


//-------------------------------------------------------
// Buy 指令自动生成订单： /buy BTC 100 USDT
//-------------------------------------------------------
bot.onText(/\/buy (.+) (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;

    const coin = match[1];
    const amount = match[2];
    const unit = match[3];

    const time = new Date().toLocaleString();

    const text =
`📣 *New Trade Request*
-----------------------
📌 *Type:* BUY
📌 *Coin:* ${coin}
📌 *Amount:* ${amount} ${unit}
📌 *TP:* None
📌 *SL:* None
⏰ *Time:* ${time}
-----------------------`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "🔒 锁单", callback_data: "lock" },
                { text: "🔓 解锁单", callback_data: "unlock" }
            ],
            [
                { text: "✅ 到账确认", callback_data: "confirm" },
                { text: "❌ 取消订单", callback_data: "cancel" }
            ]
        ]
    };

    sendOrderToAll(text, keyboard);
});


//-------------------------------------------------------
// 按键处理：锁单 / 解锁单 / 到账 / 取消订单
//-------------------------------------------------------
bot.on("callback_query", async (query) => {
    const admin = query.from.id;

    if (!isAdmin(admin)) {
        return bot.answerCallbackQuery(query.id, { text: "❌ 你无权操作此订单" });
    }

    let actionText = "";

    if (query.data === "lock") actionText = "🔒 *订单已锁定*";
    if (query.data === "unlock") actionText = "🔓 *订单已解锁*";
    if (query.data === "confirm") actionText = "✅ *已确认到账*";
    if (query.data === "cancel") actionText = "❌ *订单已取消*";

    const notifyText =
`${actionText}
👤 操作管理员：${query.from.first_name}
⏰ 时间：${new Date().toLocaleString()}`;

    // 广播：群 + 所有管理员
    sendOrderToAll(notifyText);

    bot.answerCallbackQuery(query.id, { text: "已执行" });
});


//-------------------------------------------------------
// 辅助命令：/id 显示当前聊天ID（群ID）
//-------------------------------------------------------
bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id, `📌 本聊天的 ID 是： *${msg.chat.id}*`, {
        parse_mode: "Markdown"
    });
});
