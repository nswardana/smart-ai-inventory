const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");
const { sequelize, Sale, Forecast, Product } = require("../models/database");

// --- Safe Sanitize ---
function sanitizeName(name) {
  if (!name || typeof name !== "string") return "unknown"; 

  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// MinMax Scaler
function minMaxScale(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scaled = values.map((v) => (v - min) / (max - min || 1));
  return { scaled, min, max };
}

function inverseScale(value, min, max) {
  return value * (max - min) + min;
}

// ================================
// 🚀 TRAIN MODEL
// ================================
async function trainModel(productId, window = 14) {
  const product = await Product.findOne({
    where: { product_id: productId },   // FIXED: konsisten dengan SALES
    raw: true,
  });

  if (!product) {
    console.log(`❌ Product ID ${productId} tidak ditemukan`);
    return null;
  }

  const productNameSafe = sanitizeName(product.product_name);
  const folderName = `${productId}_${productNameSafe}`;

  // Ambil data sales
  const sales = await Sale.findAll({
    where: { product_id: productId },
    order: [["date", "ASC"]],
  });

  const data = sales.map((s) => s.qty);
  if (data.length < window + 2) {
    console.log(`⚠️ Data tidak cukup untuk Train product ${productId}`);
    return null;
  }

  // Scaling
  const { scaled, min, max } = minMaxScale(data);

  let X = [];
  let y = [];

  for (let i = 0; i < scaled.length - window - 1; i++) {
    X.push(scaled.slice(i, i + window));
    y.push(scaled[i + window]);
  }

  X = tf.tensor2d(X).reshape([X.length, window, 1]);
  y = tf.tensor1d(y);

  // Build LSTM Model
  const model = tf.sequential();
  model.add(
    tf.layers.lstm({ units: 32, returnSequences: false, inputShape: [window, 1] })
  );
  model.add(tf.layers.dense({ units: 1 }));
  model.compile({ optimizer: "adam", loss: "meanSquaredError" });

  await model.fit(X, y, { epochs: 40, batchSize: 16, verbose: 0 });

  // Save model
  const modelDir = path.join(__dirname, "../models_saved", folderName);
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  await model.save("file://" + modelDir);

  fs.writeFileSync(
    path.join(modelDir, "scaler.json"),
    JSON.stringify({ min, max })
  );

  return true;
}

// ================================
// 🔮 FORECAST MODEL
// ================================
async function forecastNextDays(productId, forecastDays = 7, window = 14) {
  const product = await Product.findOne({
    where: { product_id: productId },   // FIXED: Jangan pakai id, tetapi product_id
    raw: true,
  });

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  const productNameSafe = sanitizeName(product.product_name);
  const folderName = `${productId}_${productNameSafe}`;

  const modelDir = path.join(__dirname, "../models_saved", folderName);
  const model = await tf.loadLayersModel("file://" + modelDir + "/model.json");

  const scaler = JSON.parse(
    fs.readFileSync(path.join(modelDir, "scaler.json"))
  );

  const sales = await Sale.findAll({
    where: { product_id: productId },
    order: [["date", "ASC"]],
  });

  const data = sales.map((s) => s.qty);
  const { scaled } = minMaxScale(data);

  let lastWindow = scaled.slice(-window);
  let results = [];

  for (let i = 0; i < forecastDays; i++) {
    const inputTensor = tf.tensor2d([lastWindow]).reshape([1, window, 1]);

    const prediction = model.predict(inputTensor);
    const predScaled = (await prediction.data())[0];

    const predReal = inverseScale(predScaled, scaler.min, scaler.max);
    results.push(Math.round(predReal));

    lastWindow.push(predScaled);
    lastWindow.shift();
  }

  return results;
}

module.exports = { trainModel, forecastNextDays };
