// index.js
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

// ====== 配置区域（需要时修改） ======
const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = -1003262870745;
const ADMINS = [6062973135, 7416199637, 6615925197]; // 多管理员（3 人）
// 风控阈值（按 amount 数值判断，单位同前端 amountCurrency）：
const RISK_THRESHOLD = 10000; 
// ==================================

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 存储消息状态：message_id -> { lockedBy: userId|null, actionTaken: null|'success'|'cancel', createdAt: Date }
const messageState = new Map();
// 防止重复点击：message_id -> userId（第一个操作的人）
const actionMap = new Map();

// 辅助：生成 reply keyboard（包含 成功/取消/锁单/解锁）
function makeReplyMarkup(locked) {
  // locked: { locked: boolean }
  if (locked) {
    return {
      inline_keyboard: [
        [
          { text: "🔒 已锁单（点击解锁）", callback_data: "unlock" }
        ]
      ]
    };
  } else {
    return {
      inline_keyboard: [
        [
          { text: "✔️ 成功交易", callback_data: "trade_success" },
          { text: "✖️ 取消交易", callback_data: "trade_cancel" }
        ],
        [
          { text: "🔒 锁单", callback_data: "lock" }
        ]
      ]
    };
  }
}

// 解析消息文本，取 coin/amount/amountCurrency/TP/SL 等（兼容原前端格式）
function parseTradeFromText(text) {
  const coinMatch = text.match(/Coin:\s\*?(.+?)\*?\n/);
  const amountMatch = text.match(/Amount:\s\*?(.+?)\*?\n/);
  const tpMatch = text.match(/TP:\s\*?(.+?)\*?\n/);
  const slMatch = text.match(/SL:\s\*?(.+?)\*?\n/);

  const coin = coinMatch ? coinMatch[1].trim() : "Unknown";
  let amountRaw = amountMatch ? amountMatch[1].trim() : "Unknown";
  // amountRaw 可能是 "123 USDT" 或 "123"
  let amountValue = parseFloat(amountRaw.replace(/[^\d.\-]/g, ""));
  if (isNaN(amountValue)) amountValue = null;
  // try capture currency
  const currencyMatch = amountRaw.match(/[A-Za-z$%]+$/);
  const amountCurrency = currencyMatch ? currencyMatch[0] : "";

  return {
    coin,
    amountRaw,
    amountValue,
    amountCurrency,
    tp: tpMatch ? tpMatch[1].trim() : "None",
    sl: slMatch ? slMatch[1].trim() : "None"
  };
}

// send to group + send to each admin private chat
async function broadcastTrade(trade) {
  const now = new Date().toLocaleString();
  const msg =
`📣 *New Trade Request*
Type: *${trade.tradeType.toUpperCase()}*
Coin: *${trade.coin}*
Amount: *${trade.amount}*
TP: *${trade.tp || "None"}*
SL: *${trade.sl || "None"}*
Time: ${now}`;

  const options = {
    parse_mode: "Markdown",
    reply_markup: makeReplyMarkup(false),
  };

  // send to group
  const groupMsg = await bot.sendMessage(GROUP_ID, msg, options);

  // send to each admin privately
  const adminMsgs = [];
  for (const adminId of ADMINS) {
    const m = await bot.sendMessage(adminId, msg, options);
    adminMsgs.push(m);
  }

  // 初始化状态（以 group message id 作为主键 -- 也记录 admin 消息 id）
  // 以 groupMsg.message_id 为主键（因为群里可能作为主显示）
  messageState.set(groupMsg.message_id, {
    lockedBy: null,
    actionTaken: null,
    createdAt: Date.now(),
    originalText: msg,
    adminMessageIds: adminMsgs.map(x => ({ chatId: x.chat.id, messageId: x.message_id })),
    groupMessage: { chatId: groupMsg.chat.id, messageId: groupMsg.message_id }
  });

  // 也初始化 actionMap for each sent message (group + admins) 用于防 duplication
  actionMap.set(groupMsg.message_id, null);
  for (const a of adminMsgs) actionMap.set(a.message_id, null);

  return {
    group: groupMsg,
    admins: adminMsgs
  };
}

// 后端 /trade 接口：前端调用
app.post("/trade", async (req, res) => {
  try {
    const trade = req.body;
    if (!trade.tradeType || !trade.coin || !trade.amount) {
      return res.status(400).json({ ok: false, error: "Missing parameters" });
    }

    // 组装 trade summary
    const tradeObj = {
      tradeType: trade.tradeType,
      coin: trade.coin,
      amount: `${trade.amount} ${trade.amountCurrency || ""}`.trim(),
      amountValue: Number(trade.amount),
      amountCurrency: trade.amountCurrency || "",
      tp: trade.tp || "None",
      sl: trade.sl || "None"
    };

    // 风控检查
    if (tradeObj.amountValue && tradeObj.amountValue >= RISK_THRESHOLD) {
      // 附带告警
      const warnText = `⚠️ 风控警告：检测到大额下单 (≥ ${RISK_THRESHOLD})\n金额: ${tradeObj.amount}`;
      // 给所有管理员单独发风控告警（私聊）
      for (const aid of ADMINS) {
        await bot.sendMessage(aid, warnText);
      }
      // 也在群里标注（在消息后面补一句）
      tradeObj.autoRiskWarn = warnText;
    }

    const sent = await broadcastTrade(tradeObj);

    return res.json({ ok: true, group: sent.group, admins: sent.admins });
  } catch (err) {
    console.error("POST /trade error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

// 处理回调按钮（callback_query）
bot.on("callback_query", async (callbackQuery) => {
  try {
    const data = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const fromUserId = callbackQuery.from.id;
    const fromUserName = callbackQuery.from.username ? `@${callbackQuery.from.username}` : (callbackQuery.from.first_name || `${callbackQuery.from.id}`);

    // 识别该被操作的主消息ID（we used group message id as canonical key if the callback originates from admin private message,
    // original group's message text is identical, but message_id differs. We need to find messageState by original text if needed)
    let stateEntry = messageState.get(messageId);

    if (!stateEntry) {
      // 尝试按 text 匹配 group 原始文本并找到相应 entry（兼容管理员私聊点按）
      for (const [mid, st] of messageState.entries()) {
        if (st.originalText && msg.text && st.originalText.replace(/\s+/g,' ').trim() === msg.text.replace(/\s+/g,' ').trim()) {
          stateEntry = st;
          // map messageId to this canonical mid for future speed
          messageState.set(messageId, stateEntry);
          break;
        }
      }
    }

    // 如果还是没有 stateEntry，初始化一个临时保护（避免崩溃），但不会允许操作
    if (!stateEntry) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: "无法识别此订单（可能已过期）", show_alert: true });
      return;
    }

    // 权限：只有 ADMINS 数组内的人可以操作按钮
    const isAdmin = ADMINS.includes(fromUserId);
    if (!isAdmin) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: "只有管理员可以操作此订单", show_alert: true });
      return;
    }

    // 防重复：如果已经有 actionTaken（success/cancel），不可再次操作
    if (stateEntry.actionTaken) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: "此订单已被处理", show_alert: true });
      return;
    }

    // 锁定检查
    if (data === "trade_success" || data === "trade_cancel") {
      if (stateEntry.lockedBy && stateEntry.lockedBy !== fromUserId) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "此单已被锁定，无法直接操作", show_alert: true });
        return;
      }
    }

    // parse trade detail from text for editing message content
    const parsed = parseTradeFromText(msg.text || stateEntry.originalText || "");

    if (data === "lock") {
      // set lockedBy
      stateEntry.lockedBy = fromUserId;
      // update reply markup to show locked state
      const reply_markup = makeReplyMarkup(true);
      // 更新所有已发送的消息（群 + 管理员私聊）
      // group
      if (stateEntry.groupMessage) {
        await bot.editMessageReplyMarkup(reply_markup, {
          chat_id: stateEntry.groupMessage.chatId,
          message_id: stateEntry.groupMessage.messageId
        }).catch(()=>{});
      }
      // admin private copies
      if (Array.isArray(stateEntry.adminMessageIds)) {
        for (const a of stateEntry.adminMessageIds) {
          await bot.editMessageReplyMarkup(reply_markup, {
            chat_id: a.chatId,
            message_id: a.messageId
          }).catch(()=>{});
        }
      }
      await bot.answerCallbackQuery(callbackQuery.id, { text: "已锁单，其他管理员无法直接操作" });
      return;
    } else if (data === "unlock") {
      // can unlock by any admin
      stateEntry.lockedBy = null;
      const reply_markup = makeReplyMarkup(false);
      if (stateEntry.groupMessage) {
        await bot.editMessageReplyMarkup(reply_markup, {
          chat_id: stateEntry.groupMessage.chatId,
          message_id: stateEntry.groupMessage.messageId
        }).catch(()=>{});
      }
      if (Array.isArray(stateEntry.adminMessageIds)) {
        for (const a of stateEntry.adminMessageIds) {
          await bot.editMessageReplyMarkup(reply_markup, {
            chat_id: a.chatId,
            message_id: a.messageId
          }).catch(()=>{});
        }
      }
      await bot.answerCallbackQuery(callbackQuery.id, { text: "已解锁" });
      return;
    } else if (data === "trade_success" || data === "trade_cancel") {
      // 防止重复操作（并记录操作人）
      if (actionMap.get(messageId) && actionMap.get(messageId) !== fromUserId) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "此消息已被处理", show_alert: true });
        return;
      }
      actionMap.set(messageId, fromUserId);
      stateEntry.actionTaken = (data === "trade_success") ? "success" : "cancel";

      // prepare update text
      const actionText = data === "trade_success" ? "✔️ *交易已成功！*" : "❌ *交易已取消！*";
      const updatedText =
`${actionText}
币种: *${parsed.coin}*
金额: *${parsed.amountRaw}*
操作人: ${fromUserName}
时间: ${new Date().toLocaleString()}`;

      // 编辑群内和管理员私聊所有副本（把按钮去掉）
      try {
        if (stateEntry.groupMessage) {
          await bot.editMessageText(updatedText, {
            chat_id: stateEntry.groupMessage.chatId,
            message_id: stateEntry.groupMessage.messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [] }
          });
        }
      } catch (e) { /* ignore */ }

      if (Array.isArray(stateEntry.adminMessageIds)) {
        for (const a of stateEntry.adminMessageIds) {
          try {
            await bot.editMessageText(updatedText, {
              chat_id: a.chatId,
              message_id: a.messageId,
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: [] }
            });
          } catch (e) { /* ignore */ }
        }
      }

      // 给所有管理员私聊推送确认（告知谁操作了）
      const notify = `✅ 订单已由 ${fromUserName} 处理为：${stateEntry.actionTaken === "success" ? "成功" : "取消"}\n币种: ${parsed.coin}\n金额: ${parsed.amountRaw}\n时间: ${new Date().toLocaleString()}`;
      for (const aid of ADMINS) {
        // 如果是同一条消息的来源管理员，仍给提示（保证同步）
        await bot.sendMessage(aid, notify).catch(()=>{});
      }

      await bot.answerCallbackQuery(callbackQuery.id);
      return;
    }

    // fallback
    await bot.answerCallbackQuery(callbackQuery.id, { text: "未知操作" });
  } catch (err) {
    console.error("callback_query handler error:", err);
    if (callbackQuery && callbackQuery.id) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: "处理失败，稍后重试", show_alert: true }).catch(()=>{});
    }
  }
});

// 静态首页
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// 启动
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
