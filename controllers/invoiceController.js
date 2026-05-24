const { getDB } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function getInvoices(req, res) {
  const db = getDB();
  const { date_from, date_to, status } = req.query;
  const query = {};

  if (status) query.status = status;
  if (date_from || date_to) {
    query.created_at = {};
    if (date_from) query.created_at.$gte = date_from;
    if (date_to) query.created_at.$lte = date_to + "T23:59:59";
  }

  const invoices = await db
    .collection("invoices")
    .find(query, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray();

  res.json(invoices);
}

async function createInvoice(req, res) {
  const db = getDB();
  const {
    customer_name = "",
    customer_phone = "",
    items = [],
    discount = 0,
    notes = "",
    status = "draft",
    price_type = "retail", // ← جديد
  } = req.body;

  const count = await db.collection("invoices").countDocuments({});
  const invoice_number = `INV-${String(count + 1).padStart(5, "0")}`;

  const subtotal = items.reduce((sum, item) => sum + item.total_usd, 0);
  const total_usd = subtotal - discount;

  const settings = await db
    .collection("settings")
    .findOne({ type: "app_settings" });
  const exchange_rate = settings?.exchange_rate ?? 0;

  const doc = {
    id: uuidv4(),
    invoice_number,
    customer_name,
    customer_phone,
    items,
    subtotal_usd: subtotal,
    discount,
    total_usd,
    total_syp: total_usd * exchange_rate,
    exchange_rate,
    notes,
    status,
    price_type, // ← جديد
    created_at: new Date().toISOString(),
    quantities_deducted: true, // دائماً true لأننا نطرح عند الإنشاء
  };

  await db.collection("invoices").insertOne(doc);
  delete doc._id;

  for (const item of items) {
    await db
      .collection("products")
      .updateOne(
        { id: item.product_id },
        { $inc: { quantity: -item.quantity } },
      );
  }

  res.json(doc);
}

async function updateInvoice(req, res) {
  const db = getDB();
  const { invoice_id } = req.params;
  const old = await db
    .collection("invoices")
    .findOne({ id: invoice_id }, { projection: { _id: 0 } });
  if (!old) return res.status(404).json({ detail: "الفاتورة غير موجودة" });

  const {
    customer_name,
    customer_phone,
    notes,
    discount,
    items,
    status,
    price_type,
  } = req.body;
  const update = {};

  if (customer_name != null) update.customer_name = customer_name;
  if (customer_phone != null) update.customer_phone = customer_phone;
  if (notes != null) update.notes = notes;
  if (discount != null) update.discount = discount;
  if (price_type != null) update.price_type = price_type; // ← جديد

  if (items != null) {
    update.items = items;
    const subtotal = items.reduce((sum, i) => sum + i.total_usd, 0);
    const disc = discount != null ? discount : (old.discount ?? 0);
    update.subtotal_usd = subtotal;
    update.total_usd = subtotal - disc;

    const settings = await db
      .collection("settings")
      .findOne({ type: "app_settings" });
    const exchange_rate = settings?.exchange_rate ?? 0;
    update.total_syp = update.total_usd * exchange_rate;
    update.exchange_rate = exchange_rate;
  }

  if (items != null) {
    // أرجع الكميات القديمة دائماً
    for (const item of old.items || []) {
      await db
        .collection("products")
        .updateOne(
          { id: item.product_id },
          { $inc: { quantity: item.quantity } },
        );
    }
    // اطرح الجديدة
    for (const item of items) {
      await db
        .collection("products")
        .updateOne(
          { id: item.product_id },
          { $inc: { quantity: -item.quantity } },
        );
    }
  }

  if (status != null) {
    update.status = status;
    update.quantities_deducted = true;
  }

  if (Object.keys(update).length)
    await db
      .collection("invoices")
      .updateOne({ id: invoice_id }, { $set: update });

  const invoice = await db
    .collection("invoices")
    .findOne({ id: invoice_id }, { projection: { _id: 0 } });
  res.json(invoice);
}

async function deleteInvoice(req, res) {
  const db = getDB();

  // لو الفاتورة مكتملة، أرجع الكميات قبل الحذف
  const invoice = await db
    .collection("invoices")
    .findOne({ id: req.params.invoice_id });
  if (!invoice) return res.status(404).json({ detail: "الفاتورة غير موجودة" });

  if (invoice.quantities_deducted) {
    for (const item of invoice.items || []) {
      await db
        .collection("products")
        .updateOne(
          { id: item.product_id },
          { $inc: { quantity: item.quantity } },
        );
    }
  }

  await db.collection("invoices").deleteOne({ id: req.params.invoice_id });
  res.json({ message: "تم حذف الفاتورة" });
}

module.exports = { getInvoices, createInvoice, updateInvoice, deleteInvoice };
