const axios = require('axios');

// Default URLs (bisa override via .env)
const SALES_URL = process.env.SALES_URL || 'http://51.79.188.207:9898/sales_ai/1';
const PRODUCT_URL = process.env.PRODUCT_URL || 'http://51.79.188.207:9898/product_ai';

/**
 * Fetch sales data from external API
 * Expected response: { data: [ { date, lines: [ { full_product_name, qty } ] } ] }
 */
async function fetchSales() {
  try {
    const r = await axios.get(SALES_URL);
    return r.data?.data || [];
  } catch (err) {
    console.error('❌ Failed to fetch sales:', err.message);
    return [];
  }
}

/**
 * Fetch product list from external API
 * Expected response: { data: [ { id, name, qty_available, warehouse_name } ] }
 */
async function fetchProducts() {
  try {
    const r = await axios.get(PRODUCT_URL);
    return r.data?.data || [];
  } catch (err) {
    console.error('❌ Failed to fetch products:', err.message);
    return [];
  }
}

module.exports = { fetchSales, fetchProducts };
