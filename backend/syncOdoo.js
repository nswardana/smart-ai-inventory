require('dotenv').config();
const axios = require('axios');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const { sequelize, Product, Sale, Forecast } = require('./models/database');

const LOG_FILE = path.join(__dirname, 'sync.log');

/* =======================
   Logger Utility
   ======================= */
function log(message) {
  const text = `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] ${message}\n`;
  console.log(text.trim());
  fs.appendFileSync(LOG_FILE, text);
}

/* =======================
   Truncate Tables
   ======================= */
async function truncateTables() {
  try {
    log('🧹 Menghapus semua data lama...');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await Forecast.destroy({ where: {}, truncate: true });
    await Sale.destroy({ where: {}, truncate: true });
    // await Product.destroy({ where: {}, truncate: true });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    log('✅ Semua tabel berhasil dikosongkan.');
  } catch (err) {
    log(`❌ Gagal truncate tabel: ${err.message}`);
  }
}

/* =======================
   Sync Products (optional)
   ======================= */
async function syncProducts() {
  try {
    log('📦 Sync produk dimulai...');
    const res = await axios.get(process.env.PRODUCT_API);
    const stores = res.data?.data || [];

    if (!stores.length) {
      log('⚠️ Tidak ada data produk dari API.');
      return 0;
    }

    let total = 0;
    for (const store of stores) {
      const warehouse = store.name || 'Default';
      for (const p of store.lines || []) {
        await Product.upsert({
          product_id: p.id,
          name: p.name,
          qty: p.qty || 0,
          warehouse,
        });
        total++;
      }
    }

    log(`✅ ${total} produk berhasil disimpan.`);
    return total;
  } catch (err) {
    log(`❌ Gagal sync produk: ${err.message}`);
    return 0;
  }
}

/* =======================
   Sync Sales
   ======================= */
async function syncSales() {
  try {
    log('💰 Sync penjualan dimulai...');
    log('URL :' + process.env.SALES_API);

    const res = await axios.get(process.env.SALES_API);
    const sales = res.data?.data || [];

    if (!sales.length) {
      log('⚠️ Tidak ada data penjualan dari API.');
      return 0;
    }

    let total = 0;

    for (const s of sales) {
      for (const line of s.lines || []) {
        const productNameRaw = line.full_product_name || line.product_name || 'Unknown Product';
        const productId = line.product_id;

        if (!Number.isInteger(productId)) {
          log(`⏭️ Skip penjualan karena product_id tidak valid: "${productNameRaw}"`);
          continue;
        }

        // 🔍 Cari produk berdasarkan product_id
        let product = await Product.findOne({ where: { product_id: productId } });

        // 🆕 Jika tidak ada, buat otomatis
        if (!product) {
          try {
            log(`🆕 Produk baru ditemukan dari penjualan, buat entri: ${productNameRaw}`);
            product = await Product.create({
              product_id: productId,
              name: productNameRaw,
              qty: 0,
              warehouse: 'Auto-generated',
            });
          } catch (createErr) {
            log(`⚠️ Gagal membuat produk baru (${productNameRaw}): ${createErr.message}`);
            if (createErr.errors) {
              createErr.errors.forEach(e =>
                log(`⚠️ Validation detail: ${e.message} (field: ${e.path})`)
              );
            }
            continue; // lanjut produk lain
          }
        }

        // 💾 Simpan / update penjualan
        try {
          await Sale.upsert({
            external_sale_id: s.id,
            sale_name: s.name,
            product_name: productNameRaw,
            qty: line.qty || 0,
            subtotal: line.price_subtotal || 0,
            date: new Date(s.date_order || Date.now()),
            product_id: productId,
          });
          total++;
        } catch (saleErr) {
          log(`⚠️ Gagal menyimpan penjualan untuk ${productNameRaw}: ${saleErr.message}`);
          if (saleErr.errors) {
            saleErr.errors.forEach(e =>
              log(`⚠️ Validation detail: ${e.message} (field: ${e.path})`)
            );
          }
          continue; // lanjut penjualan lain
        }
      }
    }

    log(`✅ ${total} transaksi penjualan tersimpan.`);
    return total;
  } catch (err) {
    log(`❌ Gagal sync penjualan: ${err.message}`);
    if (err.errors) {
      err.errors.forEach(e =>
        log(`⚠️ Validation detail: ${e.message} (field: ${e.path})`)
      );
    }
    return 0;
  }
}

/* =======================
   Main Runner
   ======================= */
(async () => {
  try {
    await sequelize.authenticate();
    log('✅ Database connected.');

    await sequelize.sync({ alter: true });
    log('🧩 Models synchronized.');

    await truncateTables();
    await syncProducts(); // optional, bisa diaktifkan bila perlu
    await syncSales();

    log('🏁 Semua sinkronisasi selesai.');
  } catch (err) {
    log(`❌ Initialization failed: ${err.message}`);
  } finally {
    await sequelize.close();
    log('🔒 Database connection closed.');
  }
})();
