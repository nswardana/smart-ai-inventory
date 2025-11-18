const express = require('express');
const router = express.Router();
const tf = require('@tensorflow/tfjs');
const path = require('path');
const fs = require('fs');   // <-- FIX PENTING
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

/* ======================================================
   Predict endpoint (Linux-safe, NO fetch!)
====================================================== */
async function loadLocalModel(modelDir) {
  const modelJsonPath = path.join(modelDir, "model.json");
  const weightsBinPath = path.join(modelDir, "weights.bin");

  const modelJSON = JSON.parse(fs.readFileSync(modelJsonPath, "utf8"));
  const weightData = fs.readFileSync(weightsBinPath);

  const handler = tf.io.fromMemory(
    modelJSON.modelTopology,
    modelJSON.weightsManifest[0].weights,
    weightData
  );

  return await tf.loadLayersModel(handler);
}

router.post("/predict", async (req, res) => {
  try {
    const { product_name, window, recent_window } = req.body;

    const safeName = product_name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const modelDir = path.join(MODELS_DIR, safeName);

    console.log("📦 Loading model from:", modelDir);

    let model;
    try {
      model = await loadLocalModel(modelDir);
    } catch (err) {
      console.error("❌ Failed loading:", err);
      return res.status(404).json({ error: "Model not found" });
    }

    const arr = recent_window.slice(-window);
    const input = tf.tensor3d([arr.map(v => [v])]);

    const prediction = model.predict(input);
    const forecastValue = (await prediction.data())[0];

    res.json({
      product_name,
      forecast: Math.round(forecastValue)
    });

  } catch (err) {
    console.error("❌ Predict Error:", err);
    res.status(500).json({ error: err.toString() });
  }
});

/* ======================================================
   List Forecast
====================================================== */
router.get('/', async (req, res) => {
  const rows = await Forecast.findAll({
    limit: 200,
    order: [['createdAt', 'DESC']]
  });
  res.json(rows);
});

/* ======================================================
   Endpoint: Recent Window
====================================================== */
router.get('/recent-window/:product_id', async (req, res) => {
  try {
    const { product_id } = req.params;

    if (!product_id)
      return res.status(400).json({ error: 'product_id required' });

    const product = await Product.findOne({ where: { product_id } });
    if (!product)
      return res.status(404).json({ error: 'product not found' });

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
