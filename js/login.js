document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("family-login-form");
  const errorBox = document.getElementById("login-error");
  const sessionBox = document.getElementById("already-logged-in");
  const sessionName = document.getElementById("logged-in-name");
  const logoutButton = document.getElementById("logout-button");

  const showError = message => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    const data = await response.json();
    if (response.ok && data.loggedIn) {
      sessionName.textContent = data.user.display_name || data.user.username;
      sessionBox.hidden = false;
      form.hidden = true;
    }
  } catch {
    // Login form remains available if session status cannot be checked.
  }

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    errorBox.hidden = true;

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Logging in...";

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();

      if (!response.ok) {
        showError(data.error || "Login failed.");
        return;
      }

      window.location.href = "upload.html";
    } catch {
      showError("Unable to reach the login service. Please try again.");
    } finally {
      button.disabled = false;
      button.textContent = "Login";
    }
  });

  logoutButton?.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    window.location.reload();
  });
});
