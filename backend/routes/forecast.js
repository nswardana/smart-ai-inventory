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
router.post("/predict", async (req, res) => {
  try {
    const { productId, window, sales } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // Path model
    const modelPath = `file://${__dirname}/../models_saved/${productId}/model.json`;

    console.log("📦 Loading model:", modelPath);

    let model;
    try {
      model = await tf.loadLayersModel(modelPath);
    } catch (err) {
      console.error("❌ Failed loading:", err);
      return res.status(500).json({ error: "Model not found" });
    }

    // Convert sales into tensor input
    const input = tf.tensor2d([sales.slice(-window)], [1, window]);

    // Predict
    const prediction = model.predict(input);
    const result = (await prediction.data())[0];

    res.json({
      productId,
      forecast: Math.round(result),
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
