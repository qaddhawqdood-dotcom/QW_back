const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(plain, hashed) {
  return bcrypt.compareSync(plain, hashed);
}

function createToken(data, expiresIn = "7d") {
  return jwt.sign(data, process.env.JWT_SECRET, { expiresIn });
}

module.exports = { hashPassword, verifyPassword, createToken };
