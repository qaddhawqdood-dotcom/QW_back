const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
} = require("../controllers/invoiceController");

router.get("/", getInvoices);
router.post("/", createInvoice);
router.put("/:invoice_id", updateInvoice);
router.delete("/:invoice_id", deleteInvoice);

module.exports = router;
