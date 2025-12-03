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

const BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const GROUP_ID = -1003262870745;
const ADMINS = [6062973135, 7416199637, 6615925197];
const RISK_THRESHOLD = 10000;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const messageState = new Map();
const actionMap = new Map();

function makeReplyMarkup(locked) {
  if (locked) {
    return {
      inline_keyboard: [
        [{ text: "🔒 已锁单（点击解锁）", callback_data: "unlock" }]
      ]
    };
  } else {
    return {
      inline_keyboard: [
        [
          { text: "✔️ 成功交易", callback_data: "trade_success" },
          { text: "✖️ 取消交易", callback_data: "trade_cancel" }
        ],
        [{ text: "🔒 锁单", callback_data: "lock" }]
      ]
    };
  }
}

function parseTradeFromText(text) {
  const coinMatch = text.match(/Coin:\s\*?(.+?)\*?\n/);
  const amountMatch = text.match(/Amount:\s\*?(.+?)\*?\n/);
  const tpMatch = text.match(/TP:\s\*?(.+?)\*?\n/);
  const slMatch = text.match(/SL:\s\*?(.+?)\*?\n/);

  const coin = coinMatch ? coinMatch[1].trim() : "Unknown";
  let amountRaw = amountMatch ? amountMatch[1].trim() : "Unknown";
  let amountValue = parseFloat(amountRaw.replace(/[^\d.\-]/g, ""));
  if (isNaN(amountValue)) amountValue = null;

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

async function broadcastTrade(trade) {
  const now = new Date().toLocaleString();
  const msg =
`📣 *New Trade Request*
Type: *${trade.tradeType.toUpperCase()}*
Coin: *${trade.coin}*
Amount: *${trade.amount}*
TP: *${trade.tp}*
SL: *${trade.sl}*
Time: ${now}`;

  const options = {
    parse_mode: "Markdown",
    reply_markup: makeReplyMarkup(false)
  };

  const groupMsg = await bot.sendMessage(GROUP_ID, msg, options);

  const adminMsgs = [];
  for (const adminId of ADMINS) {
    const m = await bot.sendMessage(adminId, msg, options);
    adminMsgs.push(m);
  }

  messageState.set(groupMsg.message_id, {
    lockedBy: null,
    actionTaken: null,
    createdAt: Date.now(),
    originalText: msg,
    adminMessageIds: adminMsgs.map(x => ({ chatId: x.chat.id, messageId: x.message_id })),
    groupMessage: { chatId: groupMsg.chat.id, messageId: groupMsg.message_id }
  });

  actionMap.set(groupMsg.message_id, null);
  for (const a of adminMsgs) actionMap.set(a.message_id, null);

  return { group: groupMsg, admins: adminMsgs };
}

app.post("/trade", async (req, res) => {
  try {
    const trade = req.body;
    if (!trade.tradeType || !trade.coin || !trade.amount) {
      return res.status(400).json({ ok: false, error: "Missing parameters" });
    }

    const tradeObj = {
      tradeType: trade.tradeType,
      coin: trade.coin,
      amount: `${trade.amount} ${trade.amountCurrency || ""}`.trim(),
      amountValue: Number(trade.amount),
      amountCurrency: trade.amountCurrency || "",
      tp: trade.tp || "None",
      sl: trade.sl || "None"
    };

    if (tradeObj.amountValue && tradeObj.amountValue >= RISK_THRESHOLD) {
      const warnText = `⚠️ 风控警告：检测到大额下单 (≥ ${RISK_THRESHOLD})\n金额: ${tradeObj.amount}`;
      for (const aid of ADMINS) {
        await bot.sendMessage(aid, warnText);
      }
      tradeObj.autoRiskWarn = warnText;
    }

    const sent = await broadcastTrade(tradeObj);
    return res.json({ ok: true, group: sent.group, admins: sent.admins });

  } catch (err) {
    console.error("POST /trade error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

bot.on("callback_query", async (callbackQuery) => {
  try {
    const data = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const fromUserId = callbackQuery.from.id;
    const fromUserName = callbackQuery.from.username
      ? `@${callbackQuery.from.username}`
      : (callbackQuery.from.first_name || `${callbackQuery.from.id}`);

    let stateEntry = messageState.get(messageId);

    if (!stateEntry) {
      for (const [mid, st] of messageState.entries()) {
        if (
          st.originalText &&
          msg.text &&
          st.originalText.replace(/\s+/g, " ").trim() ===
            msg.text.replace(/\s+/g, " ").trim()
        ) {
          stateEntry = st;
          messageState.set(messageId, stateEntry);
          break;
        }
      }
    }

    if (!stateEntry) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "无法识别此订单（可能已过期）",
        show_alert: true
      });
      return;
    }

    const isAdmin = ADMINS.includes(fromUserId);
    if (!isAdmin) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "只有管理员可以操作此订单",
        show_alert: true
      });
      return;
    }

    if (stateEntry.actionTaken) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "此订单已被处理",
        show_alert: true
      });
      return;
    }

    if (data === "trade_success" || data === "trade_cancel") {
      if (stateEntry.lockedBy && stateEntry.lockedBy !== fromUserId) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "此单已被锁定，无法直接操作",
          show_alert: true
        });
        return;
      }
    }

    const parsed = parseTradeFromText(msg.text || stateEntry.originalText || "");

    if (data === "lock") {
      stateEntry.lockedBy = fromUserId;
      const markup = makeReplyMarkup(true);

      if (stateEntry.groupMessage) {
        await bot.editMessageReplyMarkup(markup, {
          chat_id: stateEntry.groupMessage.chatId,
          message_id: stateEntry.groupMessage.messageId
        }).catch(() => {});
      }

      if (Array.isArray(stateEntry.adminMessageIds)) {
        for (const a of stateEntry.adminMessageIds) {
          await bot.editMessageReplyMarkup(markup, {
            chat_id: a.chatId,
            message_id: a.messageId
          }).catch(() => {});
        }
      }

      await bot.answerCallbackQuery(callbackQuery.id, { text: "已锁单" });
      return;
    }

    if (data === "unlock") {
      stateEntry.lockedBy = null;
      const markup = makeReplyMarkup(false);

      if (stateEntry.groupMessage) {
        await bot.editMessageReplyMarkup(markup, {
          chat_id: stateEntry.groupMessage.chatId,
          message_id: stateEntry.groupMessage.messageId
        }).catch(() => {});
      }

      if (Array.isArray(stateEntry.adminMessageIds)) {
        for (const a of stateEntry.adminMessageIds) {
          await bot.editMessageReplyMarkup(markup, {
            chat_id: a.chatId,
            message_id: a.messageId
          }).catch(() => {});
        }
      }

      await bot.answerCallbackQuery(callbackQuery.id, { text: "已解锁" });
      return;
    }

    if (data === "trade_success" || data === "trade_cancel") {
      if (actionMap.get(messageId) && actionMap.get(messageId) !== fromUserId) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "此消息已被处理",
          show_alert: true
        });
        return;
      }

      actionMap.set(messageId, fromUserId);
      stateEntry.actionTaken = data === "trade_success" ? "success" : "cancel";

      const actionText =
        data === "trade_success"
          ? "✔️ *交易已成功！*"
          : "❌ *交易已取消！*";

      const updatedText =
`${actionText}
币种: *${parsed.coin}*
金额: *${parsed.amountRaw}*
操作人: ${fromUserName}
时间: ${new Date().toLocaleString()}`;

      if (stateEntry.groupMessage) {
        await bot.editMessageText(updatedText, {
          chat_id: stateEntry.groupMessage.chatId,
          message_id: stateEntry.groupMessage.messageId,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [] }
        }).catch(() => {});
      }

      if (Array.isArray(stateEntry.adminMessageIds)) {
        for (const a of stateEntry.adminMessageIds) {
          await bot.editMessageText(updatedText, {
            chat_id: a.chatId,
            message_id: a.messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [] }
          }).catch(() => {});
        }
      }

      const notify =
        `✅ 订单已由 ${fromUserName} 处理为：` +
        (stateEntry.actionTaken === "success" ? "成功" : "取消") +
        `\n币种: ${parsed.coin}\n金额: ${parsed.amountRaw}\n时间: ${new Date().toLocaleString()}`;

      for (const aid of ADMINS) {
        await bot.sendMessage(aid, notify).catch(() => {});
      }

      await bot.answerCallbackQuery(callbackQuery.id);
      return;
    }

    await bot.answerCallbackQuery(callbackQuery.id, { text: "未知操作" });

  } catch (err) {
    console.error("callback_query handler error:", err);
    if (callbackQuery && callbackQuery.id) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "处理失败，稍后重试",
        show_alert: true
      }).catch(() => {});
    }
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
