const credentials = require("./credentials");

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const cookies = {};

  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }

  return cookies;
}

function requireSiteAccess(req, res) {
  const cookies = parseCookies(req);
  const expected = credentials.siteAccessCode;

  if (cookies.vera_family_access !== expected) {
    res.status(401).json({ error: "Family access code required." });
    return false;
  }
  return true;
}

function getJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function nullableText(value, maxLength = 10000) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function setNoStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

module.exports = { parseCookies, requireSiteAccess, getJsonBody, nullableText, setNoStore };
