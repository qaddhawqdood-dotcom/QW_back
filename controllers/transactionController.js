// transactionsController.js
const { getDB } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

// ── المعاملات الرئيسية (شراء / دفع عام) ──────────────────────────────

async function getTransactions(req, res) {
  const db = getDB();
  const query = {};
  if (req.query.distributor_id) query.distributor_id = req.query.distributor_id;

  const txns = await db
    .collection("distributor_transactions")
    .find(query, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray();

  // لكل معاملة شراء أضف ملخص دفعاتها
  for (const txn of txns) {
    if (txn.type === "purchase") {
      const payments = await db
        .collection("invoice_payments")
        .find({ transaction_id: txn.id }, { projection: { _id: 0 } })
        .sort({ paid_at: 1 })
        .toArray();

      const total_paid = payments.reduce((s, p) => s + (p.amount_usd || 0), 0);
      txn.payments = payments;
      txn.total_paid = total_paid;
      txn.remaining_usd = (txn.amount_usd || 0) - total_paid;
      txn.fully_paid = txn.remaining_usd <= 0;
    }
  }

  res.json(txns);
}

async function createTransaction(req, res) {
  const db = getDB();
  const {
    distributor_id,
    type, // "purchase" | "payment"
    amount_usd,
    description = "",
    invoice_number = "",
    initial_payment = 0, // دفعة أولى اختيارية عند إنشاء معاملة شراء
  } = req.body;

  if (!distributor_id || !type || !amount_usd) {
    return res.status(400).json({ detail: "بيانات ناقصة" });
  }

  const doc = {
    id: uuidv4(),
    distributor_id,
    type,
    amount_usd: parseFloat(amount_usd) || 0,
    description,
    invoice_number,
    created_at: new Date().toISOString(),
  };

  await db.collection("distributor_transactions").insertOne(doc);
  delete doc._id;

  // لو معاملة شراء وفيه دفعة أولى، سجّلها تلقائياً
  if (type === "purchase" && initial_payment > 0) {
    const payment = {
      id: uuidv4(),
      transaction_id: doc.id,
      distributor_id,
      amount_usd: parseFloat(initial_payment),
      note: "دفعة أولى",
      paid_at: new Date().toISOString(),
    };
    await db.collection("invoice_payments").insertOne(payment);
    delete payment._id;

    const total_paid = parseFloat(initial_payment);
    doc.payments = [payment];
    doc.total_paid = total_paid;
    doc.remaining_usd = doc.amount_usd - total_paid;
    doc.fully_paid = doc.remaining_usd <= 0;
  } else if (type === "purchase") {
    doc.payments = [];
    doc.total_paid = 0;
    doc.remaining_usd = doc.amount_usd;
    doc.fully_paid = false;
  }

  res.json(doc);
}

async function updateTransaction(req, res) {
  const db = getDB();
  const { transaction_id } = req.params;
  const update = {};
  for (const [k, v] of Object.entries(req.body)) if (v != null) update[k] = v;
  if (update.amount_usd) update.amount_usd = parseFloat(update.amount_usd);

  if (Object.keys(update).length)
    await db
      .collection("distributor_transactions")
      .updateOne({ id: transaction_id }, { $set: update });

  const txn = await db
    .collection("distributor_transactions")
    .findOne({ id: transaction_id }, { projection: { _id: 0 } });
  if (!txn) return res.status(404).json({ detail: "المعاملة غير موجودة" });
  res.json(txn);
}

async function deleteTransaction(req, res) {
  const db = getDB();
  const { transaction_id } = req.params;
  const result = await db
    .collection("distributor_transactions")
    .deleteOne({ id: transaction_id });
  if (result.deletedCount === 0)
    return res.status(404).json({ detail: "المعاملة غير موجودة" });

  // احذف دفعاتها معها
  await db.collection("invoice_payments").deleteMany({ transaction_id });

  res.json({ message: "تم حذف المعاملة" });
}

// ── الدفعات على معاملة محددة ─────────────────────────────────────────

async function getPayments(req, res) {
  const db = getDB();
  const { transaction_id } = req.params;

  const txn = await db
    .collection("distributor_transactions")
    .findOne({ id: transaction_id }, { projection: { _id: 0 } });
  if (!txn) return res.status(404).json({ detail: "المعاملة غير موجودة" });

  const payments = await db
    .collection("invoice_payments")
    .find({ transaction_id }, { projection: { _id: 0 } })
    .sort({ paid_at: 1 })
    .toArray();

  const total_paid = payments.reduce((s, p) => s + (p.amount_usd || 0), 0);

  res.json({
    transaction: txn,
    payments,
    total_paid,
    remaining_usd: txn.amount_usd - total_paid,
    fully_paid: txn.amount_usd - total_paid <= 0,
  });
}

async function addPayment(req, res) {
  const db = getDB();
  const { transaction_id } = req.params;
  const { amount_usd, note = "" } = req.body;

  if (!amount_usd || parseFloat(amount_usd) <= 0)
    return res.status(400).json({ detail: "المبلغ غير صالح" });

  const txn = await db
    .collection("distributor_transactions")
    .findOne({ id: transaction_id });
  if (!txn) return res.status(404).json({ detail: "المعاملة غير موجودة" });

  // تحقق إن المبلغ ما يتجاوز الباقي
  const existingPayments = await db
    .collection("invoice_payments")
    .find({ transaction_id })
    .toArray();
  const total_paid = existingPayments.reduce(
    (s, p) => s + (p.amount_usd || 0),
    0,
  );
  const remaining = txn.amount_usd - total_paid;

  if (parseFloat(amount_usd) > remaining + 0.001) {
    return res.status(400).json({
      detail: `المبلغ يتجاوز المتبقي (${remaining.toFixed(3)} $)`,
    });
  }

  const payment = {
    id: uuidv4(),
    transaction_id,
    distributor_id: txn.distributor_id,
    amount_usd: parseFloat(amount_usd),
    note,
    paid_at: new Date().toISOString(),
  };

  await db.collection("invoice_payments").insertOne(payment);
  delete payment._id;

  const new_total = total_paid + payment.amount_usd;
  const new_remaining = txn.amount_usd - new_total;

  res.json({
    payment,
    total_paid: new_total,
    remaining_usd: new_remaining,
    fully_paid: new_remaining <= 0,
  });
}

async function deletePayment(req, res) {
  const db = getDB();
  const { payment_id } = req.params;
  const result = await db
    .collection("invoice_payments")
    .deleteOne({ id: payment_id });
  if (result.deletedCount === 0)
    return res.status(404).json({ detail: "الدفعة غير موجودة" });
  res.json({ message: "تم حذف الدفعة" });
}

module.exports = {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getPayments,
  addPayment,
  deletePayment,
};
