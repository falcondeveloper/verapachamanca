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
      `SELECT event_id,
              DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
              TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
              title,
              location,
              is_optional
       FROM vera_events
       WHERE is_active = 1
       ORDER BY event_date, display_order, start_time, event_id`
    );

    return res.status(200).json({ events: rows });
  } catch (error) {
    console.error("Events error:", error);
    return res.status(500).json({ error: "Unable to load events." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
