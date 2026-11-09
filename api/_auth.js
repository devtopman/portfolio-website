import crypto from "node:crypto";

// Returns true if the request carries the correct admin password.
export function isAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  const given = req.headers["x-admin-password"];
  if (!expected || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b);
}
