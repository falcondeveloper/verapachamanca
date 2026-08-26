const { getDb } = require("../lib/db");
const { requireSiteAccess, setNoStore } = require("../lib/http");

module.exports = async function handler(req, res) {
  setNoStore(res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!requireSiteAccess(req, res)) return;

  let db;
  try {
    db = await getDb();

    const [rows] = await db.execute(
      `SELECT user_id, username, display_name
       FROM vera_users
       WHERE is_active = 1
       ORDER BY COALESCE(NULLIF(TRIM(display_name), ''), username), username`
    );

    return res.status(200).json({
      users: rows.map(user => ({
        user_id: user.user_id,
        username: user.username,
        display_name: user.display_name || user.username
      }))
    });
  } catch (error) {
    console.error("Users list error:", error);
    return res.status(500).json({ error: "Unable to load family members." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
