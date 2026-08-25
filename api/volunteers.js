const { getDb } = require("../lib/db");
const { requireSiteAccess, getJsonBody, nullableText, setNoStore } = require("../lib/http");

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (!requireSiteAccess(req, res)) return;

  let db;
  try {
    db = await getDb();

    if (req.method === "GET") {
      const [rows] = await db.execute(
        `SELECT v.volunteer_id,
                v.event_id,
                v.user_id,
                v.volunteer_name,
                v.email,
                v.phone,
                v.volunteer_role,
                v.notes,
                v.created_at,
                e.title AS event_title,
                DATE_FORMAT(e.event_date, '%Y-%m-%d') AS event_date,
                DATE_FORMAT(e.event_date, '%a %b %e') AS event_date_display
         FROM vera_event_volunteers v
         JOIN vera_events e ON e.event_id = v.event_id
         ORDER BY e.event_date, e.display_order, v.volunteer_name, v.volunteer_id`
      );
      return res.status(200).json({ volunteers: rows });
    }

    const body = getJsonBody(req);

    if (req.method === "POST") {
      const eventId = Number(body.event_id);
      const volunteerName = nullableText(body.volunteer_name, 150);
      if (!eventId || !volunteerName) {
        return res.status(400).json({ error: "Event and volunteer name are required." });
      }

      const [eventRows] = await db.execute(
        "SELECT event_id FROM vera_events WHERE event_id = ? AND is_active = 1 LIMIT 1",
        [eventId]
      );
      if (!eventRows.length) {
        return res.status(400).json({ error: "Please choose a valid event." });
      }

      const [result] = await db.execute(
        `INSERT INTO vera_event_volunteers
           (event_id, user_id, volunteer_name, email, phone, volunteer_role, notes)
         VALUES (?, NULL, ?, ?, ?, ?, ?)`,
        [
          eventId,
          volunteerName,
          nullableText(body.email, 190),
          nullableText(body.phone, 40),
          nullableText(body.volunteer_role, 150),
          nullableText(body.notes)
        ]
      );

      return res.status(201).json({ ok: true, volunteer_id: result.insertId });
    }

    if (req.method === "PUT") {
      const volunteerId = Number(body.volunteer_id);
      const eventId = Number(body.event_id);
      const volunteerName = nullableText(body.volunteer_name, 150);

      if (!volunteerId || !eventId || !volunteerName) {
        return res.status(400).json({ error: "Volunteer ID, event, and name are required." });
      }

      const [result] = await db.execute(
        `UPDATE vera_event_volunteers
         SET event_id = ?,
             volunteer_name = ?,
             email = ?,
             phone = ?,
             volunteer_role = ?,
             notes = ?
         WHERE volunteer_id = ?`,
        [
          eventId,
          volunteerName,
          nullableText(body.email, 190),
          nullableText(body.phone, 40),
          nullableText(body.volunteer_role, 150),
          nullableText(body.notes),
          volunteerId
        ]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ error: "Volunteer record was not found." });
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const volunteerId = Number(body.volunteer_id);
      if (!volunteerId) {
        return res.status(400).json({ error: "Volunteer ID is required." });
      }

      const [result] = await db.execute(
        "DELETE FROM vera_event_volunteers WHERE volunteer_id = ?",
        [volunteerId]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ error: "Volunteer record was not found." });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("Volunteers error:", error);
    return res.status(500).json({ error: "Unable to update the volunteer list." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
