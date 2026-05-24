const { getDB } = require("../config/db");

async function getDashboardStats(req, res) {
  const db = getDB();

  const [
    total_products,
    total_warehouses,
    total_categories,
    total_distributors,
  ] = await Promise.all([
    db.collection("products").countDocuments({}),
    db.collection("warehouses").countDocuments({}),
    db.collection("categories").countDocuments({}),
    db.collection("distributors").countDocuments({}),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  const today_completed = await db
    .collection("invoices")
    .find(
      { created_at: { $gte: today }, status: "completed" },
      { projection: { _id: 0, total_usd: 1, discount: 1 } },
    )
    .toArray();

  const today_draft_with_payment = await db
    .collection("invoices")
    .find(
      { created_at: { $gte: today }, status: "draft", discount: { $gt: 0 } },
      { projection: { _id: 0, discount: 1 } },
    )
    .toArray();

  const today_sales =
    today_completed.reduce(
      (s, inv) => s + (inv.total_usd ?? 0) + (inv.discount ?? 0),
      0,
    ) + today_draft_with_payment.reduce((s, inv) => s + (inv.discount ?? 0), 0);

  const today_invoices_count =
    today_completed.length + today_draft_with_payment.length;

  // ── إجمالي المبيعات ───────────────────────────────────────────
  const all_completed = await db
    .collection("invoices")
    .find(
      { status: "completed" },
      { projection: { _id: 0, total_usd: 1, discount: 1 } },
    )
    .toArray();

  const all_draft_with_payment = await db
    .collection("invoices")
    .find(
      { status: "draft", discount: { $gt: 0 } },
      { projection: { _id: 0, discount: 1 } },
    )
    .toArray();

  const total_sales =
    all_completed.reduce(
      (s, inv) => s + (inv.total_usd ?? 0) + (inv.discount ?? 0),
      0,
    ) + all_draft_with_payment.reduce((s, inv) => s + (inv.discount ?? 0), 0);

  const total_invoices = await db
    .collection("invoices")
    .countDocuments({ status: "completed" });

  // ── المخزون ───────────────────────────────────────────────────
  const products = await db
    .collection("products")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  const low_stock_count = products.filter(
    (p) => (p.quantity ?? 0) <= (p.min_quantity ?? 0),
  ).length;
  const inventory_value = products.reduce(
    (s, p) => s + (p.price_usd ?? 0) * (p.quantity ?? 0),
    0,
  );

  const recent_invoices = await db
    .collection("invoices")
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(5)
    .toArray();

  res.json({
    total_products,
    total_warehouses,
    total_categories,
    total_distributors,
    today_sales,
    today_invoices_count,
    total_invoices,
    total_sales,
    low_stock_count,
    inventory_value,
    recent_invoices,
  });
}

module.exports = { getDashboardStats };
