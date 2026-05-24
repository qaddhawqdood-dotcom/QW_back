require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { connectDB, getDB } = require("./config/db");
const { hashPassword, verifyPassword } = require("./config/auth");

// Routes
const authRoutes = require("./routes/auth");
const settingsRoutes = require("./routes/settings");
const warehouseRoutes = require("./routes/warehouses");
const categoryRoutes = require("./routes/categories");
const productRoutes = require("./routes/products");
const invoiceRoutes = require("./routes/invoices");
const distributorRoutes = require("./routes/distributors");
const transactionRoutes = require("./routes/transactions");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
const PORT = process.env.PORT || 8000;

// ── Middleware ──────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || "*").split(",");
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// ── API Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/distributors", distributorRoutes);
app.use("/api/distributor-transactions", transactionRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ── Startup ─────────────────────────────────────────────────────────────────
async function seedDatabase(db) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
  const existing = await db
    .collection("settings")
    .findOne({ type: "app_settings" });

  if (!existing) {
    await db.collection("settings").insertOne({
      type: "app_settings",
      exchange_rate: 14500,
      password_hash: hashPassword(ADMIN_PASSWORD),
    });
    console.log("✅ Default settings seeded");
  } else if (!verifyPassword(ADMIN_PASSWORD, existing.password_hash || "")) {
    await db
      .collection("settings")
      .updateOne(
        { type: "app_settings" },
        { $set: { password_hash: hashPassword(ADMIN_PASSWORD) } },
      );
    console.log("🔑 Password updated from env");
  }
}

async function createIndexes(db) {
  await db.collection("warehouses").createIndex({ id: 1 }, { unique: true });
  await db.collection("categories").createIndex({ id: 1 }, { unique: true });
  await db.collection("products").createIndex({ id: 1 }, { unique: true });
  await db.collection("products").createIndex({ warehouse_id: 1 });
  await db.collection("products").createIndex({ category_id: 1 });
  await db.collection("invoices").createIndex({ id: 1 }, { unique: true });
  await db.collection("invoices").createIndex({ created_at: 1 });
  await db.collection("distributors").createIndex({ id: 1 }, { unique: true });
  await db
    .collection("distributor_transactions")
    .createIndex({ id: 1 }, { unique: true });
  await db
    .collection("distributor_transactions")
    .createIndex({ distributor_id: 1 });
  console.log("✅ Database indexes created");
}

async function start() {
  try {
    const { db } = await connectDB();
    await seedDatabase(db);
    await createIndexes(db);

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
