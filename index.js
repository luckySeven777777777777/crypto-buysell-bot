import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// =============================
// 配置
// =============================
const TELEGRAM_BOT_TOKEN = "8423870040:AAEyKQukt720qD7qHZ9YrIS9m_x-E65coPU";
const TELEGRAM_CHAT_ID = -1003262870745; // 群 ID

const coins = ["BTC","ETH","USDT","USDC","BNB","ADA","DOGE","XRP","LTC","DOT","SOL","MATIC"];
let rate = {};
coins.forEach(c => rate[c] = Math.random()*0.1+0.01);
rate["USDT"] = 1;

// =============================
// 发送交易消息函数
// =============================
function sendTradeMessage(tradeType, coin, amount, amountCurrency, tp, sl) {
  const now = new Date().toLocaleString();
  const msg = `📣 *New Trade Request*\nType: *${tradeType.toUpperCase()}*\nCoin: *${coin}*\nAmount: *${amount} ${amountCurrency}*\nTP: *${tp}*\nSL: *${sl}*\nTime: ${now}`;

  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: msg,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✔ 成功交易", callback_data: "trade_success" },
            { text: "✖ 取消交易", callback_data: "trade_cancel" }
          ]
        ]
      }
    })
  });
}

// =============================
// Webhook 接收
// =============================
app.post("/webhook", async (req, res) => {
  const data = req.body;

  // 处理按钮点击
  if (data.callback_query) {
    const callbackData = data.callback_query.data;
    const user = data.callback_query.from.username || data.callback_query.from.first_name;
    const now = new Date().toLocaleString();

    let text = "";
    if (callbackData === "trade_success") {
      text = `✔ 交易已成功！\n操作人: @${user}\n时间: ${now}`;
    } else if (callbackData === "trade_cancel") {
      text = `❌ 交易已取消！\n操作人: @${user}\n时间: ${now}`;
    }

    if (text) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: text,
          parse_mode: "Markdown"
        })
      });
    }

    res.sendStatus(200);
    return;
  }

  res.sendStatus(200);
});

// =============================
// 前端交易页面
// =============================
app.get("/", (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Crypto Trade</title>
<style>
body { font-family: Arial; background: #111; color: white; padding:20px; }
.container { max-width:430px; margin:0 auto; }
h2 { text-align:center; margin-bottom:20px; }
.transaction-type { display:flex; justify-content:space-between; gap:4%; }
.btn { width:48%; padding:12px; border-radius:8px; border:2px solid; cursor:pointer; background:transparent; }
.buy-btn { border-color: #2ecc71; color:#2ecc71; }
.sell-btn { border-color: #e67e22; color:#e67e22; }
input, select { width:100%; padding:10px; margin-top:8px; border-radius:8px; border:1px solid #ccc; background: transparent !important; color:white !important; caret-color:white; }
.trade-btn { width:100%; padding:12px; border-radius:8px; border:2px solid #3498db; background:transparent; color:#3498db; margin-top:20px; cursor:pointer; }
.adjusted-box p { margin:5px 0; }
.stop-box input[type="number"] { width:48%; display:inline-block; margin-right:4%; margin-top:5px; background: transparent !important; color:white !important; caret-color:white; }
</style>
</head>
<body>
<div class="container">
<h2>Crypto Trade</h2>
<div class="transaction-type">
  <button class="btn buy-btn" onclick="setType('buy')">Buy</button>
  <button class="btn sell-btn" onclick="setType('sell')">Sell</button>
</div>
<label>Select Coin:</label>
<select id="currency" onchange="updateConverted()"></select>
<label>Amount:</label>
<input type="number" id="amount" placeholder="Enter amount" oninput="updateConverted()">
<label>Amount Currency:</label>
<select id="amountCurrency" onchange="updateConverted()"></select>
<div class="adjusted-box" id="convertedBox"><p><b>Auto-conversion:</b></p></div>
<div class="stop-box">
  <label><input type="checkbox" id="slCheckbox" onclick="toggleSL()"> Enable Stop-loss/Take-profit</label>
  <div id="slBox" style="display:none;">
    <input type="number" id="takeProfit" placeholder="Take-profit amount">
    <input type="number" id="stopLoss" placeholder="Stop-loss amount">
  </div>
</div>
<button class="trade-btn" onclick="sendTrade()">Trade</button>
</div>
<script>
const coins = ${JSON.stringify(coins)};
let rate = ${JSON.stringify(rate)};
let tradeType = "buy";

window.onload = () => {
  const c1 = document.getElementById("currency");
  const c2 = document.getElementById("amountCurrency");
  coins.forEach(c => {
    const o1 = document.createElement("option"); o1.value=c;o1.textContent=c;c1.appendChild(o1);
    const o2 = document.createElement("option"); o2.value=c;o2.textContent=c;c2.appendChild(o2);
  });
  c2.value="USDT";
  updateConverted();
};

function setType(type){
  tradeType = type;
  document.querySelector(".buy-btn").style.filter = (type==="buy")?"brightness(100%)":"brightness(70%)";
  document.querySelector(".sell-btn").style.filter = (type==="sell")?"brightness(100%)":"brightness(70%)";
}

function toggleSL() {
  document.getElementById("slBox").style.display = document.getElementById("slCheckbox").checked ? "block" : "none";
}

function updateConverted(){
  const amount = Number(document.getElementById("amount").value);
  const from = document.getElementById("amountCurrency").value;
  const to = document.getElementById("currency").value;
  const box = document.getElementById("convertedBox");
  box.innerHTML="<p><b>Auto-conversion:</b></p>";
  if(!amount) return;
  const v = amount * (rate[to]/rate[from]);
  box.innerHTML += "<p>"+to+": "+v.toFixed(6)+"</p>";
}

function sendTrade(){
  const coin = document.getElementById("currency").value;
  const amount = document.getElementById("amount").value;
  const amountCurrency = document.getElementById("amountCurrency").value;
  const tp = document.getElementById("takeProfit").value || "None";
  const sl = document.getElementById("stopLoss").value || "None";

  if(!amount){ alert("Enter amount"); return; }

  fetch("/trade", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({tradeType, coin, amount, amountCurrency, tp, sl})
  }).then(()=>alert("Trade sent!")).catch(()=>alert("Network error"));
}
</script>
</body>
</html>
`;
  res.send(html);
});

// =============================
// 接收前端交易请求
// =============================
app.post("/trade", (req, res) => {
  const {tradeType, coin, amount, amountCurrency, tp, sl} = req.body;
  sendTradeMessage(tradeType, coin, amount, amountCurrency, tp, sl);
  res.sendStatus(200);
});

// =============================
// 启动服务器
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
