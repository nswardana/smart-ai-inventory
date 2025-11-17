const dayjs = require('dayjs');
const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');
const { Sale, Forecast } = require('../models/database');

/* ======================================================
   1️⃣ Konversi data penjualan menjadi struktur {key: {date: qty}}
   key bisa product_id atau product_name
   ====================================================== */
function salesToDailySeries(sales, keyOption = 'product_name') {
  const series = {};
  for (const tx of sales) {
    const date = tx.date ? dayjs(tx.date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const key = keyOption === 'product_id'
      ? tx.product_id || `Unknown_${tx.product_name}`
      : tx.product_name || `Unknown_${tx.product_id}`;
    const qty = Number(tx.qty || 0);

    if (!series[key]) series[key] = {};
    series[key][date] = (series[key][date] || 0) + qty;
  }
  return series;
}

/* ======================================================
   1a️⃣ Alternatif: date random jika null (90 hari terakhir)
   ====================================================== */
function salesToDailySeriesDateRandom(sales, keyOption = 'product_name') {
  const series = {};
  const today = dayjs();

  for (const tx of sales) {
    const randomDaysAgo = Math.floor(Math.random() * 90); // 0..89 hari
    const date = tx.date ? dayjs(tx.date).format('YYYY-MM-DD') : today.subtract(randomDaysAgo, 'day').format('YYYY-MM-DD');

    const key = keyOption === 'product_id'
      ? tx.product_id || `Unknown_${tx.product_name}`
      : tx.product_name || `Unknown_${tx.product_id}`;

    const qty = Number(tx.qty || 0);

    if (!series[key]) series[key] = {};
    series[key][date] = (series[key][date] || 0) + qty;
  }

  return series;
}

/* ======================================================
   2️⃣ Buat array kontinu dari map tanggal → kuantitas
   ====================================================== */
function makeSeriesArray(map, startDate, endDate) {
  const arr = [];
  let d = dayjs(startDate);
  const end = dayjs(endDate);
  while (d.isBefore(end) || d.isSame(end)) {
    const k = d.format('YYYY-MM-DD');
    const val = map[k];
    arr.push(typeof val === 'number' && !isNaN(val) ? val : 0);
    d = d.add(1, 'day');
  }
  return arr;
}

/* ======================================================
   3️⃣ Buat dataset LSTM (input window & target)
   ====================================================== */
function createDataset(arr, window = 14) {
  const X = [];
  const y = [];
  for (let i = 0; i + window < arr.length; i++) {
    const slice = arr.slice(i, i + window).map(v => Number(v) || 0);
    X.push(slice);
    y.push(Number(arr[i + window]) || 0);
  }
  if (X.length === 0) return null;
  return {
    xs: tf.tensor3d(X, [X.length, window, 1]),
    ys: tf.tensor2d(y, [y.length, 1])
  };
}

/* ======================================================
   4️⃣ Latih dan simpan model LSTM per key
   ====================================================== */
async function trainAndSaveModel(arr, productName, MODELS_DIR, window = 14) {
  // Bersihkan arr
  arr = arr.map(v => (typeof v === 'number' && !isNaN(v) ? v : 0));

  const dataset = createDataset(arr, window);
  if (!dataset) throw new Error(`Data tidak cukup untuk training: ${productName}`);

  const { xs, ys } = dataset;

  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: 20, inputShape: [window, 1] }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
  await model.fit(xs, ys, { epochs: 20, verbose: 0 });

  // simpan manual (JSON)
  const safeName = productName.replace(/[^a-z0-9]/gi, '_');
  const savePath = path.join(MODELS_DIR, safeName);
  if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

  const modelJson = await model.toJSON();
  fs.writeFileSync(path.join(savePath, 'model.json'), JSON.stringify(modelJson));

  return model;
}

/* ======================================================
   5️⃣ Ambil window terakhir untuk prediksi berikutnya
   ====================================================== */
function makeRecentWindow(salesMap, startDate, endDate, window = 14) {
  const arr = makeSeriesArray(salesMap, startDate, endDate);
  const recent = arr.slice(-window);
  return recent.map(v => Number(v) || 0);
}

/* ======================================================
   6️⃣ Jalankan pelatihan otomatis semua produk
   ====================================================== */
async function runTraining({ useProductId = false, window = 14 } = {}) {
  const MODELS_DIR = path.join(__dirname, '../models_saved');
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

  const sales = await Sale.findAll({ raw: true });
  if (!sales.length) {
    console.log('⚠️ Tidak ada data penjualan untuk training');
    return;
  }

  const keyOption = useProductId ? 'product_id' : 'product_name';
  const daily = salesToDailySeriesDateRandom(sales, keyOption);

  for (const [key, dayMap] of Object.entries(daily)) {
    const dates = Object.keys(dayMap).sort();
    const start = dates[0];
    const end = dates[dates.length - 1];
    const arr = makeSeriesArray(dayMap, start, end);
    const total = arr.reduce((a, b) => a + b, 0);

    if (arr.length < window * 2 || total < 1) {
      console.log(`⏭️ Skip training: ${key}`);
      continue;
    }

    console.log(`🧠 Training model untuk ${key} (${arr.length} hari data)...`);
    const model = await trainAndSaveModel(arr, key, MODELS_DIR, window);

    const recent = makeRecentWindow(dayMap, start, end, window);
    const input = tf.tensor3d([recent], [1, recent.length, 1]);
    const forecastValue = model.predict(input).dataSync()[0];

    await Forecast.upsert({
      product_id: useProductId && Number.isInteger(key) ? key : null,
      product_name: !useProductId ? key : null,
      forecast: forecastValue,
      recent_window: JSON.stringify(recent)
    });

    console.log(`✅ Model saved & forecast updated untuk ${key}`);
  }

  console.log('🎯 Training selesai untuk semua produk');
}

/* ======================================================
   EXPORT
   ====================================================== */
module.exports = {
  salesToDailySeries,
  salesToDailySeriesDateRandom,
  makeSeriesArray,
  createDataset,
  trainAndSaveModel,
  makeRecentWindow,
  runTraining
};
