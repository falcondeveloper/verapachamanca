document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("family-login-form");
  const userSelect = document.getElementById("login-user");
  const errorBox = document.getElementById("login-error");
  const sessionBox = document.getElementById("already-logged-in");
  const sessionName = document.getElementById("logged-in-name");
  const logoutButton = document.getElementById("logout-button");

  const showError = message => {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  const loadUsers = async () => {
    if (!userSelect) return;

    try {
      const response = await fetch("/api/users", { credentials: "same-origin" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load family members.");
      }

      userSelect.innerHTML = '<option value="">Select your name...</option>';

      for (const user of data.users || []) {
        const option = document.createElement("option");
        option.value = user.user_id;
        option.textContent = user.display_name || user.username;
        userSelect.appendChild(option);
      }

      if (!data.users || data.users.length === 0) {
        userSelect.innerHTML = '<option value="">No family members are available</option>';
        userSelect.disabled = true;
        form?.querySelector('button[type="submit"]')?.setAttribute("disabled", "disabled");
      }
    } catch (error) {
      userSelect.innerHTML = '<option value="">Unable to load family members</option>';
      userSelect.disabled = true;
      showError(error.message || "Unable to load family members.");
    }
  };

  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    const data = await response.json();
    if (response.ok && data.loggedIn) {
      sessionName.textContent = data.user.display_name || data.user.username;
      sessionBox.hidden = false;
      form.hidden = true;
    } else {
      await loadUsers();
    }
  } catch {
    await loadUsers();
  }

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    errorBox.hidden = true;

    const userId = Number(userSelect.value);
    if (!userId) {
      showError("Select your name first.");
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Continuing...";

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ user_id: userId })
      });
      const data = await response.json();

      if (!response.ok) {
        showError(data.error || "Unable to continue.");
        return;
      }

      window.location.href = "upload.html";
    } catch {
      showError("Unable to reach the login service. Please try again.");
    } finally {
      button.disabled = false;
      button.textContent = "Continue";
    }
  });

  logoutButton?.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    window.location.reload();
  });
});
