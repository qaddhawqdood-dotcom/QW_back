const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  login,
  verifyAuth,
  logout,
  changePassword,
} = require("../controllers/authController");

router.post("/login", login);
router.get("/verify", verifyAuth);
router.post("/logout", logout);
router.post("/change-password", changePassword);

module.exports = router;
