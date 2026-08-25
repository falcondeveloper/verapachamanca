const { getDb } = require("../lib/db");
const { parseCookies, setNoStore } = require("../lib/http");

module.exports = async function handler(req, res) {
  setNoStore(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = parseCookies(req).vera_session;
  let db;

  try {
    if (token) {
      db = await getDb();
      await db.execute(
        "UPDATE vera_sessions SET is_active = 0 WHERE session_token = ?",
        [token]
      );
    }

    res.setHeader(
      "Set-Cookie",
      "vera_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Logout error:", error);
    res.setHeader(
      "Set-Cookie",
      "vera_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"
    );
    return res.status(200).json({ ok: true });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
