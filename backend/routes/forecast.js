const express = require('express');
const router = express.Router();
const tf = require('@tensorflow/tfjs-node');
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
// Predict endpoint
// ========================
router.post('/predict', async (req,res)=>{
  try{
    const { product_name, recent_window } = req.body;
    if(!product_name || !recent_window) 
      return res.status(400).json({error:'product_name & recent_window required'});

    const safeName = product_name.replace(/[^a-z0-9]/gi,'_').substring(0,120);
    const modelPath = `file://${path.join(MODELS_DIR,safeName)}/model.json`;
    const model = await tf.loadLayersModel(modelPath);

    const input = tf.tensor(recent_window).reshape([1,recent_window.length,1]);
    const pred = model.predict(input);
    const value = (await pred.data())[0];

    // simpan forecast ke DB
   // await Forecast.create({ product_name, forecast: value, recent_window: JSON.stringify(recent_window) });

    res.json({ product_name, forecast_next: value });
  }catch(e){
    console.error(e);
    res.status(500).json({error:e.message});
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
