document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("volunteer-form");
  const eventSelect = document.getElementById("volunteer-event");
  const idInput = document.getElementById("volunteer-id");
  const nameInput = document.getElementById("volunteer-name");
  const emailInput = document.getElementById("volunteer-email");
  const phoneInput = document.getElementById("volunteer-phone");
  const roleInput = document.getElementById("volunteer-role");
  const notesInput = document.getElementById("volunteer-notes");
  const saveButton = document.getElementById("volunteer-save-button");
  const cancelButton = document.getElementById("volunteer-cancel-button");
  const message = document.getElementById("volunteer-form-message");
  const tbody = document.getElementById("volunteer-table-body");
  const tableWrap = document.getElementById("volunteer-table-wrap");
  const empty = document.getElementById("volunteer-empty");
  const loading = document.getElementById("volunteer-loading");

  let volunteers = [];

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const resetForm = () => {
    form.reset();
    idInput.value = "";
    saveButton.textContent = "Add Volunteer";
    cancelButton.hidden = true;
    message.textContent = "";
  };

  async function loadEvents() {
    try {
      const response = await fetch("/api/events", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load events.");

      eventSelect.innerHTML = '<option value="">Choose an event</option>';
      for (const event of data.events) {
        const option = document.createElement("option");
        option.value = event.event_id;
        const date = event.event_date ? new Date(`${event.event_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
        option.textContent = `${date}${date ? " — " : ""}${event.title}${event.location ? ` @ ${event.location}` : ""}`;
        eventSelect.appendChild(option);
      }

      if (!data.events.length) {
        eventSelect.innerHTML = '<option value="">No events are loaded in MySQL yet</option>';
        message.textContent = "The event list is empty. Run database/02_LOAD_2026_EVENTS_MYSQL.sql once.";
      }
    } catch (error) {
      eventSelect.innerHTML = '<option value="">Unable to load events</option>';
      message.textContent = error.message;
    }
  }

  function renderVolunteers() {
    tbody.innerHTML = "";

    if (!volunteers.length) {
      tableWrap.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    tableWrap.hidden = false;

    for (const volunteer of volunteers) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Event"><strong>${escapeHtml(volunteer.event_title || `Event #${volunteer.event_id}`)}</strong><small>${escapeHtml(volunteer.event_date_display || "")}</small></td>
        <td data-label="Name">${escapeHtml(volunteer.volunteer_name)}</td>
        <td data-label="Email">${volunteer.email ? `<a href="mailto:${escapeHtml(volunteer.email)}">${escapeHtml(volunteer.email)}</a>` : ""}</td>
        <td data-label="Phone">${escapeHtml(volunteer.phone || "")}</td>
        <td data-label="Role / Task">${escapeHtml(volunteer.volunteer_role || "")}</td>
        <td data-label="Notes">${escapeHtml(volunteer.notes || "")}</td>
        <td data-label="Actions" class="volunteer-actions">
          <button type="button" class="table-action edit-volunteer" data-id="${volunteer.volunteer_id}">Edit</button>
          <button type="button" class="table-action danger delete-volunteer" data-id="${volunteer.volunteer_id}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  async function loadVolunteers() {
    loading.hidden = false;
    tableWrap.hidden = true;
    empty.hidden = true;

    try {
      const response = await fetch("/api/volunteers", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load volunteers.");
      volunteers = data.volunteers || [];
      renderVolunteers();
    } catch (error) {
      empty.hidden = false;
      empty.textContent = error.message;
    } finally {
      loading.hidden = true;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    message.textContent = "";

    const payload = {
      volunteer_id: idInput.value ? Number(idInput.value) : undefined,
      event_id: Number(eventSelect.value),
      volunteer_name: nameInput.value.trim(),
      email: emailInput.value.trim() || null,
      phone: phoneInput.value.trim() || null,
      volunteer_role: roleInput.value.trim() || null,
      notes: notesInput.value.trim() || null
    };

    if (!payload.event_id || !payload.volunteer_name) {
      message.textContent = "Please choose an event and enter your name.";
      return;
    }

    const editing = Boolean(payload.volunteer_id);
    saveButton.disabled = true;
    saveButton.textContent = editing ? "Saving..." : "Adding...";

    try {
      const response = await fetch("/api/volunteers", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save volunteer.");

      resetForm();
      message.textContent = editing ? "Volunteer updated." : "Volunteer added.";
      await loadVolunteers();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      saveButton.disabled = false;
      if (!idInput.value) saveButton.textContent = "Add Volunteer";
    }
  });

  tbody.addEventListener("click", async event => {
    const editButton = event.target.closest(".edit-volunteer");
    const deleteButton = event.target.closest(".delete-volunteer");

    if (editButton) {
      const volunteer = volunteers.find(item => String(item.volunteer_id) === editButton.dataset.id);
      if (!volunteer) return;

      idInput.value = volunteer.volunteer_id;
      eventSelect.value = volunteer.event_id;
      nameInput.value = volunteer.volunteer_name || "";
      emailInput.value = volunteer.email || "";
      phoneInput.value = volunteer.phone || "";
      roleInput.value = volunteer.volunteer_role || "";
      notesInput.value = volunteer.notes || "";
      saveButton.textContent = "Save Changes";
      cancelButton.hidden = false;
      message.textContent = "";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (deleteButton) {
      const volunteer = volunteers.find(item => String(item.volunteer_id) === deleteButton.dataset.id);
      if (!volunteer) return;
      if (!confirm(`Remove ${volunteer.volunteer_name} from the volunteer list?`)) return;

      try {
        const response = await fetch("/api/volunteers", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ volunteer_id: volunteer.volunteer_id })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to remove volunteer.");
        await loadVolunteers();
      } catch (error) {
        alert(error.message);
      }
    }
  });

  cancelButton.addEventListener("click", resetForm);
  document.getElementById("volunteer-refresh-button").addEventListener("click", loadVolunteers);

  loadEvents();
  loadVolunteers();
});
