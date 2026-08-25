document.addEventListener("DOMContentLoaded", async () => {
  const status = document.getElementById("signed-in-user");

  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    const data = await response.json();

    if (!response.ok || !data.loggedIn) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login.html?next=${returnTo}`);
      return;
    }

    if (status) {
      status.textContent = `Signed in as ${data.user.display_name || data.user.username}`;
    }
  } catch {
    window.location.replace("/login.html");
    return;
  }

  document.getElementById("upload-logout-button")?.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    window.location.replace("/index.html");
  });
});
