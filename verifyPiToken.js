const fetch = require("node-fetch"); // للتأكد من أن طلبات HTTP تعمل

async function verifyPiToken(req, res, next) {
  try {
    const token = req.headers["authorization"];
    if (!token) return res.status(401).json({ message: "No token provided" });

    // هنا نرسل التوكن إلى Pi Network API للتحقق
    const response = await fetch("https://api.minepi.com/v2/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    if (data.error) return res.status(401).json({ message: "Invalid token" });

    // لو التوكن صحيح، نضيف معلومات المستخدم للـ request
    req.user = data.user;
    next(); // نسمح للطلب بالاستمرار
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = verifyPiToken;
