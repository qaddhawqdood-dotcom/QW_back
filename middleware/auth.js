const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  let token = req.cookies?.access_token;

  if (!token) {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ detail: "غير مصرح" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ detail: "انتهت صلاحية الجلسة" });
    }
    return res.status(401).json({ detail: "رمز غير صالح" });
  }
}

module.exports = authMiddleware;
