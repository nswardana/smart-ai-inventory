require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const { sequelize, Product, Sale } = require('./models/database');
const { runTraining } = require('./services/aiService');

// 📂 File log
const LOG_FILE = path.join(__dirname, 'cron.log');

// 🧾 Logger helper
function log(message) {
  const text = `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] ${message}\n`;
  console.log(text.trim());
  fs.appendFileSync(LOG_FILE, text);
}

log('🚀 Smart AI Inventory Cron Service Started.');

// ✅ Fungsi utama sinkronisasi dari Odoo / API eksternal
async function syncFromOdoo() {
  try {
    log('🔄 Sync started...');

    const [productsRes, salesRes] = await Promise.allSettled([
      axios.get(process.env.ODOO_PRODUCTS_API),
      axios.get(process.env.ODOO_SALES_API)
    ]);

    const products =
      productsRes.status === 'fulfilled' ? productsRes.value.data || [] : [];
    const sales =
      salesRes.status === 'fulfilled' ? salesRes.value.data || [] : [];

    if (!products.length && !sales.length) {
      log('⚠️ Tidak ada data dari API Odoo.');
      return;
    }

    // 🧩 Simpan / update produk
    for (const p of products) {
      await Product.upsert({
        external_id: p.id,
        name: p.name,
        qty: p.qty_available || 0,
        warehouse: p.warehouse_name || 'Default'
      });
    }

    // 🔍 Ambil map product_name → id
    const allProducts = await Product.findAll({ attributes: ['id', 'name'] });
    const productMap = Object.fromEntries(allProducts.map(p => [p.name, p.id]));

    // 🧾 Simpan / update penjualan (dengan product_id)
    for (const s of sales) {
      const product_id = productMap[s.product_name];
      if (!product_id) {
        log(`⚠️ Produk "${s.product_name}" belum ada di tabel Products.`);
        continue;
      }

      await Sale.upsert({
        external_sale_id: s.id,
        sale_name: s.name,
        qty: s.product_uom_qty,
        subtotal: s.price_subtotal,
        date: s.date_order,
        product_id: product_id
      });
    }

    log(`✅ Sync success: ${products.length} products, ${sales.length} sales.`);
  } catch (err) {
    log(`❌ Sync failed: ${err.message}`);
  }
}

// ✅ Jadwalkan cron job setiap hari jam 02:00 WIB
cron.schedule(
  '0 2 * * *',
  async () => {
    log('🕒 Running daily cron job...');
    await syncFromOdoo();
    await runTraining();
    log('🏁 Daily cron job finished.');
  },
  { timezone: 'Asia/Jakarta' }
);

// ✅ Jalankan langsung saat file pertama kali dieksekusi
(async () => {
  try {
    await sequelize.authenticate();
    log('✅ Database connected successfully.');

    await sequelize.sync({ alter: true });
    log('🧩 Models synchronized.');

    await syncFromOdoo();
    await runTraining();
    log('🚀 Initial sync & training done.');
  } catch (err) {
    log(`❌ Initialization failed: ${err.message}`);
  }
})();
