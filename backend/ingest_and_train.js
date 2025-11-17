/**
 * CRON: Train All Product Models (Linux safe, no tfjs-node)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const tf = require('@tensorflow/tfjs'); // pure JS
const dayjs = require('dayjs');

const { sequelize, Sale, Forecast } = require('./models/database');
const {
  salesToDailySeries,
  makeSeriesArray,
  trainAndSaveModel,
  makeRecentWindow
} = require('./services/aiService');

const MODELS_DIR = path.join(__dirname, 'models_saved');

// Pastikan folder models_saved ada
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

async function main() {
  console.log("🚀 Starting CRON Training Job...");

  try {
    await sequelize.authenticate();
    console.log("✅ DB Connected");

    // Ambil semua penjualan
    const sales = await Sale.findAll({
      attributes: ['product_id', 'product_name', 'qty', 'date'],
      raw: true
    });

    // Konversi ke daily series
    const daily = salesToDailySeries(sales, 'product_id');

    for (const [productId, dayMap] of Object.entries(daily)) {
      const productName =
        sales.find(s => s.product_id == productId)?.product_name ||
        `Product_${productId}`;

      const dates = Object.keys(dayMap).sort();
      const start = dates[0];
      const end = dates[dates.length - 1];

      const arr = makeSeriesArray(dayMap, start, end);
      const total = arr.reduce((a, b) => a + b, 0);

      if (arr.length < 30 || total < 1) {
        console.log(`⏭️ Skip: ${productName}`);
        continue;
      }

      console.log(`🧠 Training model: ${productName} (${arr.length} hari)`);

      // ✅ TRAIN model & kirim MODELS_DIR
      const model = await trainAndSaveModel(arr, productName, MODELS_DIR);

      // Save model manual (JSON + weights)
      const safeName = productName.replace(/[^a-z0-9]/gi, '_');
      const savePath = path.join(MODELS_DIR, safeName);
      if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

      const modelJson = await model.toJSON(); // ambil struktur + weights
      fs.writeFileSync(path.join(savePath, 'model.json'), JSON.stringify(modelJson));

      // Prediksi menggunakan recent window
      const recent = makeRecentWindow(dayMap, start, end);
      const input = tf.tensor2d(recent, [1, recent.length]).reshape([1, recent.length, 1]);
      const forecastValue = model.predict(input).dataSync()[0];

      // Simpan ke Forecast
      await Forecast.upsert({
        product_id: productId,
        product_name: productName,
        forecast: forecastValue,
        recent_window: JSON.stringify(recent)
      });

      console.log(`✅ Done: ${productName}`);
    }

    console.log("🎯 ALL TRAINING FINISHED");

  } catch (err) {
    console.error("❌ ERROR:", err);
  } finally {
    await sequelize.close();
    console.log("🔒 DB Closed");
  }
}

// Jalankan main
main();
