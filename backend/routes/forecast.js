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

/* ======================================================
   Predict Endpoint — FINAL Linux Version
====================================================== */
router.post('/predict', async (req, res) => {
  try {
    let { product_name, product_id, recent_window } = req.body;

    // -----------------------------
    // Validasi input
    // -----------------------------
    if (!recent_window || !Array.isArray(recent_window)) {
      return res.status(400).json({ error: 'recent_window must be an array' });
    }

    recent_window = recent_window.map(v => Number(v) || 0);
    if (recent_window.length < 7) {
      return res.status(400).json({ error: 'recent_window too short (min 7 values)' });
    }

    if (!product_name && !product_id) {
      return res.status(400).json({ error: 'product_name or product_id required' });
    }

    // -----------------------------
    // Cari nama produk jika pakai product_id
    // -----------------------------
    let finalName = product_name;

    if (!finalName && product_id) {
      const row = await Sale.findOne({
        where: { product_id },
        order: [['id', 'DESC']],
        raw: true
      });
      if (!row) return res.status(404).json({ error: 'product not found' });
      finalName = row.product_name;
    }

    const safeName = finalName.replace(/[^a-z0-9]/gi, '_').substring(0, 120);
    const modelFile = path.join(MODELS_DIR, safeName, 'model.json');

    console.log("📂 Loading model from:", modelFile);

    // =====================================================
    //  Load model (khusus Linux tanpa tfjs-node)
    //  Wajib pakai tf.io.fileSystem()
    // =====================================================
    let model;
    try {
      model = await tf.loadLayersModel(tf.io.fileSystem(modelFile));
    } catch (err) {
      console.error("❌ Load model failed:", err);
      return res.status(404).json({
        error: `Model not found for product ${finalName}`,
        model_path: modelFile
      });
    }

    // -----------------------------
    // Buat tensor input
    // -----------------------------
    const inputTensor = tf.tensor3d(
      [recent_window.map(v => [v])],
      [1, recent_window.length, 1]
    );

    // -----------------------------
    // Predict
    // -----------------------------
    const pred = model.predict(inputTensor);
    const forecastValue = (await pred.data())[0];

    inputTensor.dispose();
    pred.dispose();

    return res.json({
      product_name: finalName,
      product_id: product_id || null,
      forecast_next: forecastValue
    });

  } catch (e) {
    console.error("🔥 Predict Error:", e);
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
