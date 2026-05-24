const { getDB } = require("../config/db");
const { ObjectId } = require("mongodb");

async function getSettings(req, res) {
  const db = getDB();
  const settings = await db
    .collection("settings")
    .findOne(
      { type: "app_settings" },
      { projection: { _id: 0, password_hash: 0 } },
    );
  res.json(
    settings || {
      exchange_rate: 0,
      price_percentage_change: 0,
      price_percentage_direction: "increase",
      type: "app_settings",
    },
  );
}

async function updateSettings(req, res) {
  const db = getDB();
  const update = {};

  if (req.body.exchange_rate != null)
    update.exchange_rate = req.body.exchange_rate;

  if (req.body.price_percentage_change != null)
    update.price_percentage_change = parseFloat(
      req.body.price_percentage_change,
    );

  if (req.body.price_percentage_direction != null) {
    const dir = req.body.price_percentage_direction;
    if (dir === "increase" || dir === "decrease")
      update.price_percentage_direction = dir;
  }

  if (Object.keys(update).length) {
    await db
      .collection("settings")
      .updateOne({ type: "app_settings" }, { $set: update }, { upsert: true });
  }

  // تطبيق النسبة المئوية على المنتجات فوراً
  if (
    req.body.price_percentage_change != null &&
    req.body.price_percentage_direction != null
  ) {
    const percentage = parseFloat(req.body.price_percentage_change);
    const direction = req.body.price_percentage_direction;
    const category = req.body.price_percentage_category; // "all" أو category_id

    if (percentage > 0) {
      const multiplier =
        direction === "decrease" ? 1 - percentage / 100 : 1 + percentage / 100;

      // بناء الفلتر حسب الصنف
      // حطها هيك
      let filter = {};
      if (category && category !== "all") {
        try {
          filter = { category_id: category };
        } catch (e) {
          console.log(e);
          // لو الـ id مش صالح تجاهله وطبق على الكل
          filter = {};
        }
      }
      const products = await db.collection("products").find(filter).toArray();

      const bulkOps = products.map((product) => ({
        updateOne: {
          filter: { id: product.id }, // uuid string مش ObjectId
          update: {
            $set: {
              ...(product.price_usd != null && {
                price_usd: parseFloat(
                  (product.price_usd * multiplier).toFixed(3),
                ),
              }),
              ...(product.wholesale_price_usd != null && {
                wholesale_price_usd: parseFloat(
                  (product.wholesale_price_usd * multiplier).toFixed(3),
                ),
              }),
              ...(product.bulletin_price_usd != null && {
                bulletin_price_usd: parseFloat(
                  (product.bulletin_price_usd * multiplier).toFixed(3),
                ),
              }),
            },
          },
        },
      }));

      if (bulkOps.length) {
        await db.collection("products").bulkWrite(bulkOps);
      }
    }
  }

  const settings = await db
    .collection("settings")
    .findOne(
      { type: "app_settings" },
      { projection: { _id: 0, password_hash: 0 } },
    );
  res.json(settings);
}

module.exports = { getSettings, updateSettings };
