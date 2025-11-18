/**
 * CRON: Train All Product Models (Linux safe, no tfjs-node)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { sequelize } = require('./models/database');
const { runTraining } = require('./services/aiService');

async function main() {
  console.log("🚀 Starting CRON Training Job...");
  const startTime = new Date();

  try {
    // 1. Connect DB
    await sequelize.authenticate();
    console.log("✅ DB Connected");

    // 2. Pastikan folder model tersedia
    const MODELS_DIR = path.join(__dirname, 'models_saved');
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
      console.log("📁 Folder models_saved created");
    } else {
      console.log("📁 Folder models_saved exists");
    }

    // 3. Jalankan training semua produk
    console.log("🧠 Running training for ALL products...");
    await runTraining({
      useProductId: false,
      window: 14, // default window
      savePath: MODELS_DIR,
      log: true
    });

    console.log("🎯 ALL TRAINING FINISHED");

  } catch (err) {
    console.error("❌ TRAINING ERROR:", err?.message || err);
    console.error(err);
  } finally {
    // 4. Tutup koneksi database
    try {
      await sequelize.close();
      console.log("🔒 DB Closed");
    } catch (e) {
      console.error("⚠ Error closing DB:", e);
    }

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    console.log(`⏱ Finished in ${duration}s`);
  }
}

main();
