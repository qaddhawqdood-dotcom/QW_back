const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");

router.get("/", getCategories);
router.post("/", createCategory);
router.put("/:category_id", updateCategory);
router.delete("/:category_id", deleteCategory);

module.exports = router;
