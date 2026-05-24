// distributorsController.js
const { getDB } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function getDistributors(req, res) {
  const db = getDB();
  const distributors = await db
    .collection("distributors")
    .find({}, { projection: { _id: 0 } })
    .toArray();

  for (const d of distributors) {
    const txns = await db
      .collection("distributor_transactions")
      .find({ distributor_id: d.id }, { projection: { _id: 0 } })
      .toArray();

    const purchases = txns
      .filter((t) => t.type === "purchase")
      .reduce((s, t) => s + (t.amount_usd || 0), 0);
    const payments = txns
      .filter((t) => t.type === "payment")
      .reduce((s, t) => s + (t.amount_usd || 0), 0);

    d.balance_usd = purchases - payments;
    d.total_purchases = purchases;
    d.total_payments = payments;
  }

  res.json(distributors);
}

async function createDistributor(req, res) {
  const db = getDB();
  const { name, phone = "", address = "", notes = "" } = req.body;
  const doc = {
    id: uuidv4(),
    name,
    phone,
    address,
    notes,
    created_at: new Date().toISOString(),
  };
  await db.collection("distributors").insertOne(doc);
  delete doc._id;
  res.json(doc);
}

async function updateDistributor(req, res) {
  const db = getDB();
  const { distributor_id } = req.params;
  const update = {};
  for (const [k, v] of Object.entries(req.body)) if (v != null) update[k] = v;

  if (Object.keys(update).length)
    await db
      .collection("distributors")
      .updateOne({ id: distributor_id }, { $set: update });

  const dist = await db
    .collection("distributors")
    .findOne({ id: distributor_id }, { projection: { _id: 0 } });
  if (!dist) return res.status(404).json({ detail: "الموزع غير موجود" });
  res.json(dist);
}

async function deleteDistributor(req, res) {
  const db = getDB();
  const { distributor_id } = req.params;
  const result = await db
    .collection("distributors")
    .deleteOne({ id: distributor_id });
  if (result.deletedCount === 0)
    return res.status(404).json({ detail: "الموزع غير موجود" });

  // احذف كل المعاملات والدفعات المرتبطة
  await db
    .collection("distributor_transactions")
    .deleteMany({ distributor_id });
  await db.collection("invoice_payments").deleteMany({ distributor_id });

  res.json({ message: "تم حذف الموزع" });
}

module.exports = {
  getDistributors,
  createDistributor,
  updateDistributor,
  deleteDistributor,
};
