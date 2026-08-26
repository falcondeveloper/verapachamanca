const { parseCookies } = require('./http');

async function getLoggedInUser(req, db) {
  const token = parseCookies(req).vera_session;
  if (!token) return null;

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
  if (!user) return null;

  return {
    user_id: user.user_id,
    username: user.username,
    display_name: user.display_name || user.username,
    is_admin: Boolean(user.is_admin)
  };
}

module.exports = { getLoggedInUser };
