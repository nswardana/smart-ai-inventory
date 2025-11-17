const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { sequelize, Sale, Forecast } = require('./models/database');
const { salesToDailySeries, makeSeriesArray, trainAndSaveModel, makeRecentWindow, runTraining } = require('./services/aiService');

async function main() {
  console.log("🚀 Starting CRON Training Job...");

  try {
    await sequelize.authenticate();
    console.log("✅ DB Connected");

    await runTraining({ useProductId: true });

    console.log("🎯 ALL TRAINING FINISHED");

  } catch (err) {
    console.error("❌ ERROR:", err);
  } finally {
    await sequelize.close();
    console.log("🔒 DB Closed");
  }
}

main();
