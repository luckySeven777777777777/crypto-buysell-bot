import express from "express";
import TelegramBot from "node-telegram-bot-api";

// ============================
// Telegram 配置
// ============================
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";

// ============================
// 多管理员配置（全部写这里）
// 你可以添加：个人ID、群ID、频道ID
// ============================
// ⚠ 只能写数字 ID，不能写用户名（@xxx）⚠
const ADMINS = [
    6062973135,        // 你的个人 ID
    -1003262870745,    // 群 ID
    // 你想加更多管理员就在下面继续加，例如：
    // 123456789,
    // -1001234567890
];

// 创建 Telegram Bot（使用 long polling）
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ============================
// Express 后端
// 收到前端发送的交易数据
// ============================
const app = express();
app.use(express.json());

app.post("/trade", async (req, res) => {
    const data = req.body;

    const msg =
`📣 *New Trade Request*
━━━━━━━━━━━━━━
📝 Type: *${data.type.toUpperCase()}*
💰 Coin: *${data.coin}*
🔢 Amount: *${data.amount} ${data.amountCurrency}*
🎯 TP: *${data.tp}*
🛑 SL: *${data.sl}*
⏰ Time: ${data.time}
━━━━━━━━━━━━━━`;

    try {
        // 发送给所有管理员
        for (const adminId of ADMINS) {
            await bot.sendMessage(adminId, msg, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✔ 成功交易", callback_data: "trade_success" },
                            { text: "✖ 取消交易", callback_data: "trade_cancel" }
                        ]
                    ]
                }
            });
        }

        res.json({ ok: true });

    } catch (err) {
        console.error("❌ 发送失败:", err);
        res.status(500).json({ ok: false });
    }
});

// ============================
// 处理管理员点击按钮
// ============================
bot.on("callback_query", async (query) => {
    const action = query.data;
    const operator = query.from.first_name || "Admin";

    let resultText = "";

    if (action === "trade_success") {
        resultText = `✔ *交易已确认成功*\n操作者: ${operator}`;
    } else if (action === "trade_cancel") {
        resultText = `✖ *交易已被取消*\n操作者: ${operator}`;
    }

    // 通知所有管理员/群组
    for (const adminId of ADMINS) {
        await bot.sendMessage(adminId, resultText, { parse_mode: "Markdown" });
    }

    bot.answerCallbackQuery(query.id);
});

// ============================
// 启动 HTTP 服务
// ============================
app.listen(3000, () => {
    console.log("🚀 Server running on port 3000");
});
