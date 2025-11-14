/**
 * CRON: Train All Product Models
 * --------------------------------
 * 1. Fetch sales data from DB
 * 2. Aggregate per product_id
 * 3. Train LSTM model & save
 * 4. Update forecast table
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { sequelize, Product, Sale } = require('./models/database');
const { 
  salesToDailySeries, 
  salesToDailySeriesDateRandom,
  makeSeriesArray, 
  trainAndSaveModel, 
  makeRecentWindow 
} = require('./services/aiService');
const tf = require('@tensorflow/tfjs');

const { Forecast } = require('./models/database');

const MODELS_DIR = path.join(__dirname, 'models_saved');

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
// Ambil semua data penjualan
const sales = await Sale.findAll({
  attributes: ['product_id', 'product_name', 'qty', 'date'],
  raw: true
});

// Buat daily series { product_id: {date: totalQty} }
const daily = salesToDailySeries(sales, 'product_id');

for (const [productId, dayMap] of Object.entries(daily)) {
  // Ambil nama produk dari salah satu transaksi
  const productName = sales.find(s => s.product_id == productId)?.product_name || `Product_${productId}`;

  const dates = Object.keys(dayMap).sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  const arr = makeSeriesArray(dayMap, start, end);
  const total = arr.reduce((a,b)=>a+b,0);

  if (arr.length < 30 || total < 1) {
    console.log(`⏭️ Skip training: ${productName}`);
    continue;
  }

  console.log(`🧠 Training model untuk ${productName} (${arr.length} hari data)...`);
  await trainAndSaveModel(arr, productName, MODELS_DIR);

  const recent = makeRecentWindow(dayMap, start, end);
  const modelPath = `file://${path.join(MODELS_DIR, productName.replace(/[^a-z0-9]/gi, '_'))}`;
  const model = await tf.loadLayersModel(modelPath + '/model.json');
  const input = tf.tensor2d(recent, [1, recent.length]).reshape([1, recent.length, 1]);
  const forecastValue = model.predict(input).dataSync()[0];

  await Forecast.upsert({
    product_id: productId,
    product_name: productName,
    forecast: forecastValue,
    recent_window: JSON.stringify(recent),
  });

    console.log(`✅ Model saved & forecast updated untuk ${productName}`);
  }

    console.log('🎯 Training selesai untuk semua produk');
  } catch (err) {
    console.error('❌ Error training:', err);
  } finally {
    await sequelize.close();
    console.log('🔒 Database connection closed');
  }
}

main();
