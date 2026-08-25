const { getDb } = require("../lib/db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let db;
  try {
    db = await getDb();
    const [rows] = await db.execute("SELECT DATABASE() AS database_name, NOW() AS database_time");
    return res.status(200).json({ ok: true, database: rows[0] });
  } catch (error) {
    console.error("Database health error:", error);
    return res.status(500).json({ ok: false, error: "Database connection failed." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
