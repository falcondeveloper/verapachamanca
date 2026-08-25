const { getDb } = require("../lib/db");
const { parseCookies, requireSiteAccess, setNoStore } = require("../lib/http");

module.exports = async function handler(req, res) {
  setNoStore(res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!requireSiteAccess(req, res)) return;

  const token = parseCookies(req).vera_session;
  if (!token) return res.status(200).json({ loggedIn: false });

  let db;
  try {
    db = await getDb();

    const [rows] = await db.execute(
      `SELECT u.user_id, u.username, u.display_name, u.is_admin
       FROM vera_sessions s
       JOIN vera_users u ON u.user_id = s.user_id
       WHERE s.session_token = ?
         AND s.is_active = 1
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    const user = rows[0];
    if (!user) return res.status(200).json({ loggedIn: false });

    return res.status(200).json({
      loggedIn: true,
      user: {
        user_id: user.user_id,
        username: user.username,
        display_name: user.display_name || user.username,
        is_admin: Boolean(user.is_admin)
      }
    });
  } catch (error) {
    console.error("Session error:", error);
    return res.status(500).json({ error: "Unable to check login." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
