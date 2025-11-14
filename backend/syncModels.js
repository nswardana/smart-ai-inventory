const { sequelize } = require("./models/database");

async function syncDB() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");
    await sequelize.sync({ alter: true }); // gunakan alter agar auto update struktur
    console.log("✅ All models synchronized successfully");
  } catch (err) {
    console.error("❌ Error syncing database:", err);
  } finally {
    await sequelize.close();
  }
}

syncDB();
