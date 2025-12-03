import TelegramBot from "node-telegram-bot-api";
import express from "express";

// -------------------------------
// 读取环境变量
// -------------------------------
const token = process.env.BOT_TOKEN;
const GROUP_ID = process.env.GROUP_ID;      // 群ID
const OWNER_ID = process.env.PRIVATE_ID;    // 你的私人ID

// 你要求添加的多个管理员
const ADMINS = [
  OWNER_ID,        // 原管理员
  "6615925197",    // 新管理员
  "7416199637"     // 新管理员
];

// 创建机器人（使用 polling 模式）
const bot = new TelegramBot(token, { polling: true });

// -------------------------------
// 判断是否管理员
// -------------------------------
function isAdmin(userId) {
  return ADMINS.includes(String(userId));
}

// -------------------------------
// 发送订单到群和管理员
// -------------------------------
function broadcastToAll(text, options = {}) {
  bot.sendMessage(GROUP_ID, text, options).catch(() => {});
  ADMINS.forEach((adminId) => {
    bot.sendMessage(adminId, text, options).catch(() => {});
  });
}

// -------------------------------
// 生成操作按钮
// -------------------------------
function actionButtons(orderId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ 确认到账", callback_data: `done_${orderId}` },
          { text: "❌ 取消订单", callback_data: `cancel_${orderId}` }
        ],
        [
          { text: "🔒 锁单", callback_data: `lock_${orderId}` },
          { text: "🔓 解锁单", callback_data: `unlock_${orderId}` }
        ]
      ]
    }
  };
}

// -------------------------------
// 接收用户发来的消息（模拟用户下单）
// -------------------------------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;

  // 获取群ID的指令（仅调试使用）
  if (text === "/id") {
    bot.sendMessage(chatId, `📌 当前会话 ID：${chatId}`);
    return;
  }

  // 忽略机器人自己的消息
  if (msg.from.is_bot) return;

  // 假设用户发送：buy 100 usdt
  if (text.startsWith("buy")) {
    const parts = text.split(" ");
    const amount = parts[1] ?? "未知金额";
    const coin = parts[2] ?? "USDT";

    const orderId = Date.now(); // 生成订单号

    const message = `
🆕 新订单创建  
订单号：${orderId}  
币种：${coin}  
金额：${amount}  
用户：${msg.from.first_name}
    `;

    /// 推送到群 + 所有管理员
    broadcastToAll(message, actionButtons(orderId));
  }
});

// -------------------------------
// 按钮事件处理
// -------------------------------
bot.on("callback_query", (query) => {
  const userId = query.from.id;
  const messageId = query.message.message_id;
  const text = query.data;

  if (!isAdmin(userId)) {
    bot.answerCallbackQuery(query.id, { text: "⛔ 你没有权限操作" });
    return;
  }

  const [action, orderId] = text.split("_");

  let response = "";

  switch (action) {
    case "done":
      response = `✅ 订单已确认到账\n订单号：${orderId}`;
      break;

    case "cancel":
      response = `❌ 订单已取消\n订单号：${orderId}`;
      break;

    case "lock":
      response = `🔒 该订单已被锁定\n订单号：${orderId}`;
      break;

    case "unlock":
      response = `🔓 订单已解锁\n订单号：${orderId}`;
      break;
  }

  // 同时推送群 + 管理员
  broadcastToAll(response);

  bot.answerCallbackQuery(query.id, { text: "操作成功" });
});

// -------------------------------
// 保持 Express 运行 (Railway 需要)
// -------------------------------
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000);
