const { getDB } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function getCategories(req, res) {
  const db = getDB();
  const categories = await db
    .collection("categories")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  res.json(categories);
}

async function createCategory(req, res) {
  const db = getDB();
  const { name, description = "" } = req.body;
  const doc = {
    id: uuidv4(),
    name,
    description,
    created_at: new Date().toISOString(),
  };
  await db.collection("categories").insertOne(doc);
  delete doc._id;
  res.json(doc);
}

async function updateCategory(req, res) {
  const db = getDB();
  const { category_id } = req.params;
  const update = {};
  for (const [k, v] of Object.entries(req.body)) if (v != null) update[k] = v;

  if (Object.keys(update).length)
    await db
      .collection("categories")
      .updateOne({ id: category_id }, { $set: update });

  const cat = await db
    .collection("categories")
    .findOne({ id: category_id }, { projection: { _id: 0 } });
  if (!cat) return res.status(404).json({ detail: "الصنف غير موجود" });
  res.json(cat);
}

async function deleteCategory(req, res) {
  const db = getDB();
  const result = await db
    .collection("categories")
    .deleteOne({ id: req.params.category_id });
  if (result.deletedCount === 0)
    return res.status(404).json({ detail: "الصنف غير موجود" });
  res.json({ message: "تم حذف الصنف" });
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
