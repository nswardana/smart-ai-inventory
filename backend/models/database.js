require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

/* =======================
   DATABASE CONFIG
   ======================= */
const DB_NAME = process.env.DB_NAME || "smart_ai_inventory";
const DB_USER = process.env.DB_USER || "root";
const DB_PASS = process.env.DB_PASS || "";
const DB_HOST = process.env.DB_HOST || "127.0.0.1";

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  dialect: "mysql",
  logging: (msg) => console.log("🪶 SQL:", msg), // tampilkan semua query ke console
});

/* =======================
   PRODUCT MODEL
   ======================= */
const Product = sequelize.define("Product", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  product_id: { type: DataTypes.INTEGER, unique: true }, // kode eksternal unik
  name: { type: DataTypes.STRING, allowNull: false, unique: false },
  qty: { type: DataTypes.FLOAT, defaultValue: 0 },
  warehouse: DataTypes.STRING,
}, {
  timestamps: true,
  tableName: "Products",
});

/* =======================
   SALE MODEL
   ======================= */
const Sale = sequelize.define("Sale", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  external_sale_id: { type: DataTypes.INTEGER, unique: true },
  sale_name: DataTypes.STRING,
  product_id: { type: DataTypes.INTEGER, allowNull: true }, // refer ke Products.product_id
  product_name: { type: DataTypes.STRING, allowNull: true },
  qty: DataTypes.FLOAT,
  subtotal: DataTypes.FLOAT,
  date: DataTypes.DATE,
}, {
  timestamps: true,
  tableName: "Sales",
});

/* =======================
   FORECAST MODEL
   ======================= */
const Forecast = sequelize.define("Forecast", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  product_id: { type: DataTypes.INTEGER, allowNull: true }, // refer ke Products.product_id
  product_name: { type: DataTypes.STRING, allowNull: true },
  forecast: { type: DataTypes.FLOAT, allowNull: false },
  recent_window: DataTypes.TEXT,
}, {
  timestamps: true,
  tableName: "Forecasts",
});

/* =======================
   RELATIONSHIPS
   ======================= */
// Penting: gunakan sourceKey & targetKey = "product_id" agar relasi mengacu ke kolom product_id
Product.hasMany(Sale, {
  foreignKey: "product_id",
  sourceKey: "product_id",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

Sale.belongsTo(Product, {
  foreignKey: "product_id",
  targetKey: "product_id",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

Product.hasMany(Forecast, {
  foreignKey: "product_id",
  sourceKey: "product_id",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

Forecast.belongsTo(Product, {
  foreignKey: "product_id",
  targetKey: "product_id",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

/* =======================
   EXPORT
   ======================= */
module.exports = { sequelize, Product, Sale, Forecast };
