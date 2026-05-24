const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getPayments,
  addPayment,
  deletePayment,
} = require("../controllers/transactionController");

router.get("/", getTransactions);
router.post("/", createTransaction);
router.put("/:transaction_id", updateTransaction);
router.delete("/:transaction_id", deleteTransaction);

router.get("/:transaction_id/payments", getPayments);
router.post("/:transaction_id/payments", addPayment);
router.delete("/payments/:payment_id", deletePayment);

module.exports = router;
