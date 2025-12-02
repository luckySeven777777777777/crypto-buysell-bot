// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());

// CORS: 允许来自任何地方（Strikingly）
// 生产时请限制 origin
app.use(cors());

// 从环境变量读取
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'change_this_key';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL not set — server will fail when trying to use DB.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// 中间件：简单 API-Key 验证（用于保护写接口）
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 获取汇率（示例：从 DB 或 mock）
app.get('/api/rate', async (req, res) => {
  try {
    // 简单返回 DB 中 rate 表的所有货币
    const result = await pool.query('SELECT symbol, rate_usdt FROM rates ORDER BY symbol');
    res.json({ success: true, rates: result.rows });
  } catch (err) {
    console.error('rate err', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 查询余额（示例） - 需 API_KEY
app.get('/api/balance', requireApiKey, async (req, res) => {
  const userId = req.query.user || 'guest';
  try {
    const r = await pool.query('SELECT coin, balance FROM balances WHERE user_id=$1', [userId]);
    res.json({ success: true, balances: r.rows });
  } catch (err) {
    console.error('balance err', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 提交交易（buy/sell）
app.post('/api/trade', requireApiKey, async (req, res) => {
  try {
    const { user = 'guest', type, coin, amount, price } = req.body;
    if (!type || !coin || !amount) return res.status(400).json({ success: false, error: 'Missing fields' });

    // 简单验证
    const created_at = new Date();
    const q = `INSERT INTO trades(user_id, type, coin, amount, price, created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`;
    const r = await pool.query(q, [user, type, coin, amount, price || 0, created_at]);

    // 可在此对余额做写入/更新（示例化）
    res.json({ success: true, trade_id: r.rows[0].id });
  } catch (err) {
    console.error('trade err', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mock deposit 地址或创建充值记录
app.post('/api/deposit', requireApiKey, async (req, res) => {
  try {
    const { user = 'guest', coin } = req.body;
    // 生成 mock 地址
    const address = `${coin}_ADDR_${Math.random().toString(36).slice(2,9)}`;
    res.json({ success: true, address });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 简单获取最近交易（供前端显示）
app.get('/api/trades/recent', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, user_id, type, coin, amount, price, created_at FROM trades ORDER BY id DESC LIMIT 50');
    res.json({ success: true, trades: r.rows });
  } catch (err) {
    console.error('recent err', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 启动
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
