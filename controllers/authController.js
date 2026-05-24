const { getDB } = require("../config/db");
const { hashPassword, verifyPassword, createToken } = require("../config/auth");

async function login(req, res) {
  const { password } = req.body;
  const db = getDB();
  const settings = await db
    .collection("settings")
    .findOne({ type: "app_settings" });

  if (!settings)
    return res.status(500).json({ detail: "لم يتم إعداد النظام بعد" });
  if (!verifyPassword(password, settings.password_hash))
    return res.status(401).json({ detail: "كلمة المرور غير صحيحة" });

  const token = createToken({ role: "admin" });
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ token, message: "تم تسجيل الدخول بنجاح" });
}

async function verifyAuth(req, res) {
  res.json({ authenticated: true, user: req.user });
}

async function logout(req, res) {
  res.clearCookie("access_token", { path: "/" });
  res.json({ message: "تم تسجيل الخروج" });
}

async function changePassword(req, res) {
  const { old_password, new_password } = req.body;
  const db = getDB();
  const settings = await db
    .collection("settings")
    .findOne({ type: "app_settings" });

  if (!verifyPassword(old_password, settings.password_hash))
    return res.status(400).json({ detail: "كلمة المرور القديمة غير صحيحة" });

  await db
    .collection("settings")
    .updateOne(
      { type: "app_settings" },
      { $set: { password_hash: hashPassword(new_password) } },
    );
  res.json({ message: "تم تغيير كلمة المرور بنجاح" });
}

module.exports = { login, verifyAuth, logout, changePassword };
