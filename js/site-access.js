(() => {
  const ACCESS_COOKIE = "vera_family_access";
  const ACCESS_CODE = "1517";

  const hasAccess = document.cookie
    .split(";")
    .map(part => part.trim())
    .some(part => part === `${ACCESS_COOKIE}=${ACCESS_CODE}`);

  if (hasAccess) return;

  const path = window.location.pathname;
  if (path.endsWith("/access.html") || path === "/access.html") return;

  const next = window.location.pathname + window.location.search + window.location.hash;
  window.location.replace(`/access.html?next=${encodeURIComponent(next)}`);
})();
