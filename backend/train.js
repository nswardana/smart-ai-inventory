/**
 * CRON: Train All Product Models + Generate Forecast
 * Using SALES table as primary source (unique product_id)
 * Folder saved as: models_saved/<productId>_<sanitizedName>/
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config();

const { sequelize, Sale, Forecast, Product } = require("./models/database");
const { trainModel, forecastNextDays } = require("./services/aiServicev2");

async function main() {
  console.log("🚀 Starting CRON Training + Forecast Job...");

  try {
    await sequelize.authenticate();
    console.log("✅ DB Connected");

    // ============================
    // 🗑️ TRUNCATE FORECAST TABLE
    // ============================
    console.log("🗑️ Truncating Forecasts table...");
    await sequelize.query("TRUNCATE TABLE Forecasts");
    console.log("✅ Forecasts table cleared");

    // ============================
    // 📦 Ambil semua sales data
    // ============================
    const sales = await Sale.findAll({ raw: true });
    if (!sales.length) {
      console.log("⚠️ Tidak ada sales data, proses dihentikan.");
      return;
    }

    console.log(`📦 Loaded ${sales.length} sales records`);

    // ============================
    // 🔍 Ambil unique product_id dari sales
    // ============================
    const productIds = [...new Set(sales.map((s) => s.product_id))];
    console.log(`📦 Found ${productIds.length} unique products in sales`);

    // ============================
    // 📁 Pastikan folder models_saved ada
    // ============================
    const MODELS_DIR = path.join(__dirname, "models_saved");
    if (!fs.existsSync(MODELS_DIR))
      fs.mkdirSync(MODELS_DIR, { recursive: true });

    // ============================
    // 📌 Loop product_id dari SALES
    // ============================
    for (const productId of productIds) {
      console.log(`\n==============================`);
      console.log(`🔥 Training Model for Product ID: ${productId}`);
      console.log(`==============================`);

      // --------------------------
      // 🔍 Ambil product_name dari DB
      // --------------------------
      const product = await Product.findOne({
        where: { id: productId },
        raw: true,
      });

      if (!product) {
        console.log(`❌ Product ID ${productId} NOT FOUND`);
        continue;
      }

      const productName = product.product_name;

      // --------------------------
      // Step 1: Train Model
      // --------------------------
      const trained = await trainModel(productId, productName, 14);
      if (!trained) {
        console.log(`⚠️ Skip product_id ${productId} — data not enough`);
        continue;
      }

      // --------------------------
      // Step 2: Forecast
      // --------------------------
      const forecastDays = 7;
      const predictions = await forecastNextDays(
        productId,
        productName,
        forecastDays,
        14
      );

      console.log(
        `📊 Forecast Result for Product ${productId} (${productName}):`,
        predictions
      );

      // --------------------------
      // Step 3: Save Forecast to DB
      // --------------------------
      for (let i = 0; i < predictions.length; i++) {
        const forecastDate = new Date();
        forecastDate.setDate(forecastDate.getDate() + (i + 1)); // mulai besok

        await Forecast.create({
          product_id: productId,
          forecast_date: forecastDate,
          forecast_qty: predictions[i],
        });
      }

      console.log(
        `💾 Saved ${forecastDays} forecast rows for product ${productId}`
      );
    }

    console.log("\n🎯 ALL TRAINING + FORECAST FINISHED");
  } catch (err) {
    console.error("❌ ERROR:", err);
  } finally {
    await sequelize.close();
    console.log("🔒 DB Closed");
  }
}

main();
