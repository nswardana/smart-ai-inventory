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

  try {
    await sequelize.authenticate();
    console.log("✅ DB Connected");

    // Folder untuk model
    const MODELS_DIR = path.join(__dirname, 'models_saved');
    if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

    // Jalankan training semua produk
    await runTraining({ useProductId: false, window: 14 });

    console.log("🎯 ALL TRAINING FINISHED");

  } catch (err) {
    console.error("❌ ERROR:", err);
  } finally {
    await sequelize.close();
    console.log("🔒 DB Closed");
  }
}

main();
