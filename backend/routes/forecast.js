const express = require('express');
const router = express.Router();
const tf = require('@tensorflow/tfjs');
const path = require('path');
const dayjs = require('dayjs');
const { Forecast, Product, Sale } = require('../models/database'); // pastikan Sale ada
const { Op } = require('sequelize');

const MODELS_DIR = path.join(__dirname,'..','models_saved');

// ========================
// Fungsi bantu: buat array 14 hari terakhir
// ========================
async function makeRecentWindow(product_id, days = 14) {

  console.log("makeRecentWindow");

  const endDate = dayjs();
  const startDate = endDate.subtract(days - 1, 'day');

  //console.log("startDate",startDate.toDate());
  //console.log("endDate",endDate.toDate());
  
  // ambil penjualan terakhir dari tabel Sale (atau stok)
  const sales = await Sale.findAll({
    where: {
      product_id,
      createdAt: {
        [Op.between]: [startDate.toDate(), endDate.toDate()]
      }
    }
  });

  //console.log("sales",sales);
  //buat map tanggal -> qty

  const salesMap = {};
  sales.forEach(s => {
    const k = dayjs(s.date).format('YYYY-MM-DD');
    salesMap[k] = (salesMap[k] || 0) + s.qty;
  });

  console.log("salesMap",salesMap);

  // buat array 14 hari, default 0 jika tidak ada penjualan
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
// Predict endpoint (FINAL)
// ========================
router.post('/predict', async (req, res) => {
  try {
    let { product_name, product_id, recent_window } = req.body;

    // ============================
    // 1. Validasi input
    // ============================
    if (!recent_window || !Array.isArray(recent_window))
      return res.status(400).json({ error: 'recent_window must be an array of numbers' });

    // convert value ke number (hindari string masuk ke tensor)
    recent_window = recent_window.map(v => Number(v) || 0);

    if ((!product_name && !product_id))
      return res.status(400).json({ error: 'product_name or product_id required' });

    // ============================
    // 2. Tentukan nama folder model
    // ============================
    // - Jika input product_name → pakai nama folder product_name
    // - Jika input product_id → cari product_name di database
    let finalProductName = product_name;

    if (!finalProductName && product_id) {
      const row = await Sale.findOne({
        where: { product_id },
        order: [['id', 'DESC']],
        raw: true
      });
      if (!row) return res.status(404).json({ error: 'product not found in DB' });
      finalProductName = row.product_name;
    }

    const safeName = finalProductName.replace(/[^a-z0-9]/gi, '_').substring(0, 120);
    const modelPath = `file://${path.join(MODELS_DIR, safeName)}/model.json`;

    // ============================
    // 3. Load model
    // ============================
    let model;
    try {
      model = await tf.loadLayersModel(modelPath);
    } catch (err) {
      return res.status(404).json({ 
        error: `Model not found for product ${finalProductName}`,
        model_path: modelPath 
      });
    }

    // pastikan window minimal 7–30
    if (recent_window.length < 7)
      return res.status(400).json({ error: 'recent_window too short (min 7 values)' });

    // ============================
    // 4. Prepare tensor input
    // ============================
    const inputTensor = tf.tensor3d(
      [recent_window.map(v => [v])],  // [[[v],[v],[v]...]]
      [1, recent_window.length, 1]    // [batch=1, timesteps=N, features=1]
    );

    // ============================
    // 5. Predict
    // ============================
    const pred = model.predict(inputTensor);
    const forecastValue = (await pred.data())[0];

    inputTensor.dispose();
    pred.dispose();

    // ============================
    // 6. Response
    // ============================
    return res.json({
      product_name: finalProductName,
      product_id: product_id || null,
      forecast_next: forecastValue
    });

  } catch (e) {
    console.error("🔥 Predict Error:", e);
    return res.status(500).json({ error: e.message });
  }
});


// ========================
// List saved forecasts
// ========================
router.get('/', async (req,res)=>{
  const rows = await Forecast.findAll({ limit: 200, order:[['createdAt','DESC']]});
  res.json(rows);
});

// ========================
// GET recent 14-day window
// ========================
router.get('/recent-window/:product_id', async (req, res) => {
  try {
    const { product_id } = req.params;
    if (!product_id) return res.status(400).json({ error: 'product_id required' });

    const product = await Product.findOne({ where: { product_id: product_id } });
    if (!product) return res.status(404).json({ error: 'product not found' });

    const recent_window = await makeRecentWindow(product_id, 14);

    res.json({ product_id, product_name: product.name, recent_window });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
