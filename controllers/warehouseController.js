const { getDB } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function getWarehouses(req, res) {
  const db = getDB();
  const warehouses = await db
    .collection("warehouses")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  res.json(warehouses);
}

async function createWarehouse(req, res) {
  const db = getDB();
  const { name, location = "", description = "" } = req.body;
  const doc = {
    id: uuidv4(),
    name,
    location,
    description,
    created_at: new Date().toISOString(),
  };
  await db.collection("warehouses").insertOne(doc);
  delete doc._id;
  res.json(doc);
}

async function updateWarehouse(req, res) {
  const db = getDB();
  const { warehouse_id } = req.params;
  const update = {};
  for (const [k, v] of Object.entries(req.body)) if (v != null) update[k] = v;

  if (Object.keys(update).length)
    await db
      .collection("warehouses")
      .updateOne({ id: warehouse_id }, { $set: update });

  const warehouse = await db
    .collection("warehouses")
    .findOne({ id: warehouse_id }, { projection: { _id: 0 } });
  if (!warehouse) return res.status(404).json({ detail: "المحل غير موجود" });
  res.json(warehouse);
}

async function deleteWarehouse(req, res) {
  const db = getDB();
  const result = await db
    .collection("warehouses")
    .deleteOne({ id: req.params.warehouse_id });
  if (result.deletedCount === 0)
    return res.status(404).json({ detail: "المحل غير موجود" });
  res.json({ message: "تم حذف المحل" });
}

module.exports = {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
