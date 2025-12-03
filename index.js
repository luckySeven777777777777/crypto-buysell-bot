// =========================
//   Telegram 机器人设置
// =========================
import express from "express";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";

const token = process.env.BOT_TOKEN;

// ✨ 多管理员列表
const ADMINS = [
    6062973135,   // 你
    6615925197,   // 管理员2
    7416199637    // 管理员3
];

// 创建机器人（开启轮询模式）
const bot = new TelegramBot(token, { polling: true });


// =========================
//     获取群ID（调试用）
// =========================
bot.on("message", async (msg) => {
    if (msg.text === "/id") {
        bot.sendMessage(msg.chat.id, `📌 本聊天的 ID 是：\n${msg.chat.id}`);
    }
});


// =========================
//     订单按键模板
// =========================
function orderKeyboard(orderId) {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✔ 成功交易", callback_data: `success_${orderId}` },
                    { text: "✖ 取消交易", callback_data: `cancel_${orderId}` }
                ],
                [
                    { text: "🔒 锁单", callback_data: `lock_${orderId}` },
                    { text: "🔓 解锁", callback_data: `unlock_${orderId}` }
                ],
                [
                    { text: "💰 确认到账", callback_data: `confirm_${orderId}` }
                ]
            ]
        }
    };
}


// =========================
//     自动识别订单消息
// =========================
bot.on("message", async (msg) => {
    if (!msg.text) return;

    // 过滤命令避免重复触发
    if (msg.text.startsWith("/")) return;

    const chatId = msg.chat.id;
    const orderId = Date.now(); // 订单编号

    // 回复带按钮的订单
    bot.sendMessage(
        chatId,
        `🧾 新订单：\n${msg.text}\n\n订单号：${orderId}`,
        orderKeyboard(orderId)
    );
});


// =========================
//       回调按钮处理
// =========================
bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const from = callbackQuery.from;
    const data = callbackQuery.data;

    // 权限检测（非管理员拒绝点击）
    if (!ADMINS.includes(from.id)) {
        return bot.answerCallbackQuery(callbackQuery.id, {
            text: "⚠️ 你没有权限执行此操作",
            show_alert: true
        });
    }

    // 解析数据格式： success_订单号
    const [action, orderId] = data.split("_");

    let response = "";

    switch (action) {
        case "success":
            response = `✔ 订单 ${orderId} 已成功交易`;
            break;

        case "cancel":
            response = `✖ 订单 ${orderId} 已取消`;
            break;

        case "lock":
            response = `🔒 订单 ${orderId} 已锁单`;
            break;

        case "unlock":
            response = `🔓 订单 ${orderId} 已解除锁单`;
            break;

        case "confirm":
            response = `💰 订单 ${orderId} 已确认到账`;
            break;

        default:
            response = "未知操作";
    }

    // 群里广播
    bot.sendMessage(msg.chat.id, response);

    // 给管理员回复操作成功
    bot.answerCallbackQuery(callbackQuery.id, { text: "操作成功" });
});


// =========================
//       Express 服务器
// =========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running at ${PORT}`));
