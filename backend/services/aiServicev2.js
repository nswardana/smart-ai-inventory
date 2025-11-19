const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");
const { sequelize, Sale, Forecast, Product } = require("../models/database");

// --- Sanitize product name ---
function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")    // Ganti simbol jadi "_"
    .replace(/_+/g, "_")            // Hilangkan double underscores
    .replace(/^_+|_+$/g, "");       // Trim _ diawal/akhir
}

function minMaxScale(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scaled = values.map(v => (v - min) / (max - min || 1));
  return { scaled, min, max };
}

function inverseScale(value, min, max) {
  return value * (max - min) + min;
}

async function trainModel(productId, window = 14) {
  const product = await Product.findOne({ where: { id: productId } });
  if (!product) throw new Error("Product not found");

  const productNameSafe = sanitizeName(product.product_name);

  const sales = await Sale.findAll({
    where: { product_id: productId },
    order: [["date", "ASC"]],
  });

  const data = sales.map(s => s.qty);

  if (data.length < window + 2) return null;

  const { scaled, min, max } = minMaxScale(data);

  let X = [];
  let y = [];

  for (let i = 0; i < scaled.length - window - 1; i++) {
    X.push(scaled.slice(i, i + window));
    y.push(scaled[i + window]);
  }

  X = tf.tensor2d(X).reshape([X.length, window, 1]);
  y = tf.tensor1d(y);

  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: 32, returnSequences: false, inputShape: [window, 1] }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({ optimizer: "adam", loss: "meanSquaredError" });

  await model.fit(X, y, { epochs: 40, batchSize: 16, verbose: 0 });

  // --- Save model safely ---
  const folderName = `${productId}_${productNameSafe}`;
  const modelDir = path.join(__dirname, "../models_saved", folderName);

  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  await model.save("file://" + modelDir);

  fs.writeFileSync(
    path.join(modelDir, "scaler.json"),
    JSON.stringify({ min, max })
  );

  return true;
}

// --- Forecast ---
async function forecastNextDays(productId, forecastDays = 7, window = 14) {
  const product = await Product.findOne({ where: { id: productId } });
  if (!product) throw new Error("Product not found");

  const productNameSafe = sanitizeName(product.product_name);
  const folderName = `${productId}_${productNameSafe}`;

  const modelDir = path.join(__dirname, "../models_saved", folderName);
  const model = await tf.loadLayersModel("file://" + modelDir + "/model.json");

  const scaler = JSON.parse(fs.readFileSync(path.join(modelDir, "scaler.json")));

  const sales = await Sale.findAll({
    where: { product_id: productId },
    order: [["date", "ASC"]],
  });

  let data = sales.map(s => s.qty);

  const { scaled } = minMaxScale(data);

  let lastWindow = scaled.slice(-window);
  let results = [];

  for (let i = 0; i < forecastDays; i++) {
    let inputTensor = tf.tensor2d([lastWindow]).reshape([1, window, 1]);

    let prediction = model.predict(inputTensor);
    let predScaled = (await prediction.data())[0];

    let predReal = inverseScale(predScaled, scaler.min, scaler.max);
    results.push(Math.round(predReal));

    lastWindow.push(predScaled);
    lastWindow.shift();
  }

  return results;
}

module.exports = { trainModel, forecastNextDays };
