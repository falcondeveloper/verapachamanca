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
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!username || !password) {
    return res.status(400).json({ error: "Enter your username and password." });
  }

  let db;
  try {
    db = await getDb();

    const [rows] = await db.execute(
      `SELECT user_id, username, password_text, display_name, is_admin, is_active
       FROM vera_users
       WHERE username = ?
       LIMIT 1`,
      [username]
    );

    const user = rows[0];
    if (!user || !user.is_active || String(user.password_text) !== password) {
      return res.status(401).json({ error: "Username or password is not correct." });
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
