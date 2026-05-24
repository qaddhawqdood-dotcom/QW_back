const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

router.get("/", getProducts);
router.post("/", createProduct);
router.put("/:product_id", updateProduct);
router.delete("/:product_id", deleteProduct);

module.exports = router;
