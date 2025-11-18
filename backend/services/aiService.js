const dayjs = require('dayjs');
const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');
const { Sale, Forecast } = require('../models/database');

/* ======================================================
   🔹 1. Convert sales → {product: {date: qty}}
   ====================================================== */
function salesToDailySeries(sales, keyOption = 'product_name') {
  const series = {};
  for (const tx of sales) {
    const date = tx.date
      ? dayjs(tx.date).format('YYYY-MM-DD')
      : dayjs().format('YYYY-MM-DD');

    const key = keyOption === 'product_id'
      ? (tx.product_id || `Unknown_${tx.product_name}`)
      : (tx.product_name || `Unknown_${tx.product_id}`);

    const qty = Number(tx.qty || 0);

    if (!series[key]) series[key] = {};
    series[key][date] = (series[key][date] || 0) + qty;
  }
  return series;
}

/* ======================================================
   🔹 2. Buat array kontinu
   ====================================================== */
function makeSeriesArray(map, startDate, endDate) {
  const arr = [];
  let d = dayjs(startDate);
  const end = dayjs(endDate);

  while (d.isBefore(end) || d.isSame(end)) {
    arr.push(Number(map[d.format('YYYY-MM-DD')] || 0));
    d = d.add(1, 'day');
  }
  return arr;
}

/* ======================================================
   🔹 3. Normalisasi Min-Max untuk training
   ====================================================== */
function minMaxScale(arr) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);

  if (max === min) {
    return { scaled: arr.map(() => 0), min, max };
  }

  const scaled = arr.map(v => (v - min) / (max - min));
  return { scaled, min, max };
}

/* ======================================================
   🔹 4. Kembalikan forecast menjadi nilai asli (inverse scaling)
   ====================================================== */
function inverseMinMax(value, min, max) {
  return (value * (max - min)) + min;
}

/* ======================================================
   🔹 5. Dataset LSTM
   ====================================================== */
function createDataset(arr, window = 14) {
  const X = [];
  const y = [];

  for (let i = 0; i + window < arr.length; i++) {
    X.push(arr.slice(i, i + window).map(v => [v]));
    y.push([arr[i + window]]);
  }

  if (!X.length) return null;

  return {
    xs: tf.tensor3d(X),
    ys: tf.tensor2d(y)
  };
}

/* ======================================================
   🔹 6. Train & Save Model + Scaler
   ====================================================== */
async function trainAndSaveModel(arr, productName, MODELS_DIR, window = 14) {
  // ----- NORMALISASI -----
  const { scaled, min, max } = minMaxScale(arr);

  // Buat dataset
  const dataset = createDataset(scaled, window);
  if (!dataset) return null;

  // ----- MODEL -----
  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: 20, inputShape: [window, 1] }));
  model.add(tf.layers.dense({ units: 1 }));
  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

  await model.fit(dataset.xs, dataset.ys, { epochs: 10 });

  // ----- SAVE MODEL -----
  const safeName = productName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const saveDir = path.join(MODELS_DIR, safeName);
  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

  // Simpan model manual
  await model.save(tf.io.withSaveHandler(async (artifacts) => {
    fs.writeFileSync(
      path.join(saveDir, "model.json"),
      JSON.stringify({
        modelTopology: artifacts.modelTopology,
        weightsManifest: [{
          paths: ["weights.bin"],
          weights: artifacts.weightSpecs
        }]
      })
    );
    fs.writeFileSync(
      path.join(saveDir, "weights.bin"),
      Buffer.from(artifacts.weightData)
    );
    return { modelArtifactsInfo: artifacts };
  }));

  // ----- SAVE SCALER -----
  fs.writeFileSync(
    path.join(saveDir, "scaler.json"),
    JSON.stringify({ min, max })
  );

  console.log(`💾 Model + scaler saved: ${saveDir}`);
  return { model, min, max };
}

/* ======================================================
   🔹 7. Ambil window terakhir
   ====================================================== */
function makeRecentWindow(map, start, end, window = 14) {
  return makeSeriesArray(map, start, end).slice(-window);
}

/* ======================================================
   🔹 8. TRAINING UTAMA
   ====================================================== */
async function runTraining({ useProductId = false, window = 14 } = {}) {
  const MODELS_DIR = path.join(__dirname, '../models_saved');
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

  const sales = await Sale.findAll({ raw: true });
  if (!sales.length) return console.log("⚠️ Tidak ada sales data");

  const keyOption = useProductId ? 'product_id' : 'product_name';
  const daily = salesToDailySeries(sales, keyOption);

  for (const [key, dayMap] of Object.entries(daily)) {

    const dates = Object.keys(dayMap).sort();
    if (dates.length < 30) {
      console.log(`⏭️ Skip (min 30 hari): ${key}`);
      continue;
    }

    const arr = makeSeriesArray(dayMap, dates[0], dates[dates.length - 1]);
    if (arr.reduce((a, b) => a + b, 0) < 1) {
      console.log(`⏭️ Skip (no movement): ${key}`);
      continue;
    }

    console.log(`🧠 Training model: ${key}`);

    const { model, min, max } =
      await trainAndSaveModel(arr, key, MODELS_DIR, window) || {};

    if (!model) continue;

    // ----- FORECAST -----
    const recentRaw = makeRecentWindow(dayMap, dates[0], dates[dates.length - 1], window);

    // scale window
    const recentScaled = recentRaw.map(v => (v - min) / (max - min));

    const input = tf.tensor3d([recentScaled.map(v => [v])]);
    const predScaled = model.predict(input).dataSync()[0];

    const forecastReal = inverseMinMax(predScaled, min, max);

    await Forecast.upsert({
      product_id: useProductId ? Number(key) || null : null,
      product_name: !useProductId ? key : null,
      forecast: forecastReal,
      recent_window: JSON.stringify(recentRaw)
    });

    console.log(`✅ Forecast saved: ${key} = ${forecastReal}`);
  }

  console.log("🎯 Training selesai!");
}

/* ======================================================
   EXPORT
   ====================================================== */
module.exports = {
  salesToDailySeries,
  makeSeriesArray,
  minMaxScale,
  inverseMinMax,
  createDataset,
  trainAndSaveModel,
  makeRecentWindow,
  runTraining
};
