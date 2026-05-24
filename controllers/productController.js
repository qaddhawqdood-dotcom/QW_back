const { getDB } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function getProducts(req, res) {
  const db = getDB();
  const { warehouse_id, category_id, search, low_stock } = req.query;

  const query = {};
  if (warehouse_id) query.warehouse_id = warehouse_id;
  if (category_id) query.category_id = category_id;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { code: { $regex: search, $options: "i" } },
    ];
  }

  let products = await db
    .collection("products")
    .find(query, { projection: { _id: 0 } })
    .toArray();

  if (low_stock === "true") {
    products = products.filter(
      (p) => (p.quantity ?? 0) <= (p.min_quantity ?? 0),
    );
  }

  res.json(products);
}

async function createProduct(req, res) {
  const db = getDB();
  const {
    name,
    code = "",
    category_id = "",
    warehouse_id = "",
    price_usd = 0,
    wholesale_price_usd = 0,
    bulletin_price_usd = 0,
    cost_usd = 0,
    quantity = 0,
    min_quantity = 0,
    unit = "قطعة",
    description = "",
  } = req.body;

  const doc = {
    id: uuidv4(),
    name,
    code,
    category_id,
    warehouse_id,
    price_usd: parseFloat(price_usd) || 0,
    wholesale_price_usd: parseFloat(wholesale_price_usd) || 0,
    bulletin_price_usd: parseFloat(bulletin_price_usd) || 0,
    cost_usd: parseFloat(cost_usd) || 0,
    quantity: parseInt(quantity) || 0,
    min_quantity: parseInt(min_quantity) || 0,
    unit,
    description,
    created_at: new Date().toISOString(),
  };

  await db.collection("products").insertOne(doc);
  delete doc._id;
  res.json(doc);
}

async function updateProduct(req, res) {
  const db = getDB();
  const { product_id } = req.params;
  const update = {};

  for (const [k, v] of Object.entries(req.body)) {
    if (v != null) update[k] = v;
  }

  // تأكد إن الأسعار الثلاثة تتحول لأرقام لو موجودة
  if (update.price_usd != null)
    update.price_usd = parseFloat(update.price_usd) || 0;
  if (update.wholesale_price_usd != null)
    update.wholesale_price_usd = parseFloat(update.wholesale_price_usd) || 0;
  if (update.bulletin_price_usd != null)
    update.bulletin_price_usd = parseFloat(update.bulletin_price_usd) || 0;
  if (update.cost_usd != null)
    update.cost_usd = parseFloat(update.cost_usd) || 0;
  if (update.quantity != null) update.quantity = parseInt(update.quantity) || 0;
  if (update.min_quantity != null)
    update.min_quantity = parseInt(update.min_quantity) || 0;

  if (Object.keys(update).length)
    await db
      .collection("products")
      .updateOne({ id: product_id }, { $set: update });

  const product = await db
    .collection("products")
    .findOne({ id: product_id }, { projection: { _id: 0 } });

  if (!product) return res.status(404).json({ detail: "المنتج غير موجود" });
  res.json(product);
}

async function deleteProduct(req, res) {
  const db = getDB();
  const result = await db
    .collection("products")
    .deleteOne({ id: req.params.product_id });
  if (result.deletedCount === 0)
    return res.status(404).json({ detail: "المنتج غير موجود" });
  res.json({ message: "تم حذف المنتج" });
}

module.exports = { getProducts, createProduct, updateProduct, deleteProduct };
