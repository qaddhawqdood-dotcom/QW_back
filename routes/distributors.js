const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getDistributors,
  createDistributor,
  updateDistributor,
  deleteDistributor,
} = require("../controllers/distributorController");

router.get("/", getDistributors);
router.post("/", createDistributor);
router.put("/:distributor_id", updateDistributor);
router.delete("/:distributor_id", deleteDistributor);

module.exports = router;
