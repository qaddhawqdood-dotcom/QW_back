const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} = require("../controllers/warehouseController");

router.get("/", getWarehouses);
router.post("/", createWarehouse);
router.put("/:warehouse_id", updateWarehouse);
router.delete("/:warehouse_id", deleteWarehouse);

module.exports = router;
