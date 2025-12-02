import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ====== Telegram Bot Token ======
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ====== 群组：已加入你的 -1003262870745 ======
let GROUPS = [
  -1003262870745
];

// ====== 管理员（你自己默认是管理员）=====
let ADMINS = [
  6062973135   // 你
];

// ====== 普通用户（可动态添加）=====
let USERS = [];


// ============= 群通知函数 =============
async function notifyGroups(text) {
  for (let chatId of GROUPS) {
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown"
      })
    });
  }
}


// ============= 设置 Webhook 入口 =============
app.post("/webhook", async (req, res) => {
  const data = req.body;

  // ============= 普通消息 =============
  if (data.message) {
    const msg = data.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || "";

    // ==== 管理员命令 ====
    if (ADMINS.includes(userId)) {

      // 添加管理员
      if (text.startsWith("/addadmin")) {
        const id = Number(text.split(" ")[1]);
        if (!ADMINS.includes(id)) ADMINS.push(id);

        return fetch(`${API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `管理员 ${id} 已添加`
          })
        });
      }

      // 添加用户
      if (text.startsWith("/adduser")) {
        const id = Number(text.split(" ")[1]);
        if (!USERS.includes(id)) USERS.push(id);

        return fetch(`${API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `用户 ${id} 已添加`
          })
        });
      }

      // 添加群聊
      if (text.startsWith("/addgroup")) {
        const id = Number(text.split(" ")[1]);
        if (!GROUPS.includes(id)) GROUPS.push(id);

        return fetch(`${API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `群组 ${id} 已添加`
          })
        });
      }
    }


    // ==== 普通用户消息 ====
    if (text.startsWith("/start")) {
      return fetch(`${API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "欢迎使用 Crypto Trade 交易系统 Bot！"
        })
      });
    }
  }


  // ============= 按钮 callback（成功 / 取消） =============
  if (data.callback_query) {
    const cq = data.callback_query;
    const userId = cq.from.id;
    const chatId = cq.message.chat.id;
    const action = cq.data;

    // 必须管理员才能按按钮
    if (!ADMINS.includes(userId)) {
      return fetch(`${API}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: cq.id,
          text: "❌ 你没有权限执行此操作",
          show_alert: true
        })
      });
    }

    if (action === "trade_success") {
      await notifyGroups("✔ 管理员确认：交易成功！");
    }
    if (action === "trade_cancel") {
      await notifyGroups("✖ 管理员取消了交易！");
    }

    await fetch(`${API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: cq.id,
        text: "操作已提交"
      })
    });
  }


  res.send("OK");
});


// ============= Railway 监听端口 =============
app.listen(3000, () => {
  console.log("Bot Webhook running on port 3000");
});
