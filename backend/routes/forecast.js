const express = require('express');
const router = express.Router();
const tf = require('@tensorflow/tfjs');
const path = require('path');
const dayjs = require('dayjs');
const { Forecast, Product, Sale } = require('../models/database');
const { Op } = require('sequelize');

const MODELS_DIR = path.join(__dirname, '..', 'models_saved');

/* ======================================================
   Fungsi: Ambil 14 hari terakhir penjualan
====================================================== */
async function makeRecentWindow(product_id, days = 14) {

  const endDate = dayjs();
  const startDate = endDate.subtract(days - 1, 'day');

  const sales = await Sale.findAll({
    where: {
      product_id,
      createdAt: {
        [Op.between]: [startDate.toDate(), endDate.toDate()]
      }
    }
  });

  const salesMap = {};
  sales.forEach(s => {
    const k = dayjs(s.date).format('YYYY-MM-DD');
    salesMap[k] = (salesMap[k] || 0) + s.qty;
  });

  const arr = [];
  let d = startDate;
  while (d.isBefore(endDate) || d.isSame(endDate)) {
    const k = d.format('YYYY-MM-DD');
    arr.push(salesMap[k] || 0);
    d = d.add(1, 'day');
  }
  return arr;
}
// ========================
// Predict endpoint (Linux-safe, NO tfjs-node)
// ========================
router.post('/predict', async (req, res) => {
  try {
    const { product_name, recent_window } = req.body;

    if (!product_name || !recent_window) {
      return res.status(400).json({
        error: "product_name & recent_window are required"
      });
    }

    // Sanitized name
    const safeName = product_name.replace(/[^a-z0-9]/gi, "_").substring(0, 120);
    const modelDir = path.join(MODELS_DIR, safeName);

    const modelJsonPath = path.join(modelDir, "model.json");

    if (!fs.existsSync(modelJsonPath)) {
      return res.status(404).json({
        error: `Model not found for product: ${product_name}`
      });
    }

    // ========= FIX: LOAD MODEL WITHOUT fetch() =========
    const handler = tf.io.fileSystem(modelJsonPath);
    const model = await tf.loadLayersModel(handler);

    console.log(`🔍 Loaded model for: ${product_name}`);

    // Prepare input
    const inputTensor = tf.tensor(recent_window).reshape([1, recent_window.length, 1]);

    const prediction = model.predict(inputTensor);
    const value = (await prediction.data())[0];

    return res.json({
      product_name,
      forecast_next: value
    });

  } catch (e) {
    console.error("❌ Predict Error:", e);
    return res.status(500).json({ error: e.message });
  }
});


/* ======================================================
   List Forecast
====================================================== */
router.get('/', async (req, res) => {
  const rows = await Forecast.findAll({ limit: 200, order: [['createdAt', 'DESC']] });
  res.json(rows);
});

/* ======================================================
   Endpoint: Ambil window 14 hari terakhir
====================================================== */
router.get('/recent-window/:product_id', async (req, res) => {
  try {
    const { product_id } = req.params;

    if (!product_id) return res.status(400).json({ error: 'product_id required' });

    const product = await Product.findOne({ where: { product_id } });
    if (!product) return res.status(404).json({ error: 'product not found' });

    const recent_window = await makeRecentWindow(product_id, 14);

    res.json({
      product_id,
      product_name: product.name,
      recent_window
    });

  } catch (err) {
    console.error("🔥 recent-window Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
