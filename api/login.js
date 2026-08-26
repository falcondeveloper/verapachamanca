const crypto = require("crypto");
const { getDb } = require("../lib/db");
const { requireSiteAccess, getJsonBody, setNoStore } = require("../lib/http");

module.exports = async function handler(req, res) {
  setNoStore(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!requireSiteAccess(req, res)) return;

  const body = getJsonBody(req);
  const userId = Number(body.user_id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Select your name first." });
  }

  let db;
  try {
    db = await getDb();

    const [rows] = await db.execute(
      `SELECT user_id, username, display_name, is_admin, is_active
       FROM vera_users
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(404).json({ error: "That family member is not available." });
    }

    const token = crypto.randomBytes(32).toString("hex");

    await db.execute(
      `INSERT INTO vera_sessions (user_id, session_token, is_active)
       VALUES (?, ?, 1)`,
      [user.user_id, token]
    );

    // 10 years. There is no normal session expiration for this family site.
    const maxAge = 60 * 60 * 24 * 365 * 10;
    res.setHeader(
      "Set-Cookie",
      `vera_session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`
    );

    return res.status(200).json({
      ok: true,
      user: {
        user_id: user.user_id,
        username: user.username,
        display_name: user.display_name || user.username,
        is_admin: Boolean(user.is_admin)
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login service is unavailable right now." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
