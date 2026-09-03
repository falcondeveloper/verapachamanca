
document.addEventListener("DOMContentLoaded", () => {
  const featuredPhotoTiles = document.querySelectorAll("[data-featured-photo-year]");
  featuredPhotoTiles.forEach(async tile => {
    const year = tile.dataset.featuredPhotoYear;
    try {
      const response = await fetch(`/api/photos?year=${encodeURIComponent(year)}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) return;

      const data = await response.json();
      const headerPhoto = Array.isArray(data.photos)
        ? data.photos.find(photo => photo.media_type !== "video" && photo.image_url)
        : null;

      const image = tile.querySelector("img");
      if (headerPhoto && image) image.src = headerPhoto.image_url;
    } catch (_) {
      // Keep the existing color background when a thumbnail is unavailable.
    }
  });

  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(isOpen));
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    }));
  }


  document.querySelectorAll(".nav-dropdown-toggle").forEach(button => {
    button.addEventListener("click", event => {
      if (window.innerWidth > 900) return;
      event.preventDefault();
      const dropdown = button.closest(".nav-dropdown");
      const open = dropdown.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
  });

  document.querySelectorAll(".nav-submenu-toggle").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      const submenu = button.closest(".nav-submenu");
      const open = submenu.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
  });

  const tabs = document.querySelectorAll(".day-tab");
  const panels = document.querySelectorAll(".schedule-panel");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
      panels.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      document.querySelector(`[data-panel="${tab.dataset.day}"]`)?.classList.add("active");
    });
  });

  const countdown = document.querySelector(".countdown");
  if (countdown) {
    const target = new Date(countdown.dataset.date).getTime();
    const updateCountdown = () => {
      const distance = Math.max(0, target - Date.now());
      const days = Math.floor(distance / 86400000);
      const hours = Math.floor((distance % 86400000) / 3600000);
      const minutes = Math.floor((distance % 3600000) / 60000);
      document.getElementById("days").textContent = String(days).padStart(3, "0");
      document.getElementById("hours").textContent = String(hours).padStart(2, "0");
      document.getElementById("minutes").textContent = String(minutes).padStart(2, "0");
    };
    updateCountdown();
    setInterval(updateCountdown, 60000);
  }

  const galleryItems = document.querySelectorAll(".gallery-item");
  const lightbox = document.querySelector(".lightbox");
  const lightboxImage = document.querySelector(".lightbox-image");
  const lightboxCaption = document.querySelector(".lightbox-caption");
  galleryItems.forEach(item => item.addEventListener("click", () => {
    if (!lightbox) return;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    lightboxCaption.textContent = item.textContent.trim();
    lightboxImage.style.background = getComputedStyle(item).background;
  }));
  document.querySelector(".lightbox-close")?.addEventListener("click", () => {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
  });
  lightbox?.addEventListener("click", event => {
    if (event.target === lightbox) {
      lightbox.classList.remove("open");
      lightbox.setAttribute("aria-hidden", "true");
    }
  });

  // Public gallery year is driven by the URL, e.g. gallery.html?year=1998.
  const galleryYear = document.getElementById("gallery-year");
  if (galleryYear) {
    const rawYear = new URLSearchParams(window.location.search).get("year") || "2026";
    const requestedYear = rawYear.toLowerCase().replace(/[_\s]+/g, "-");
    const isBefore1980 = ["before-1980", "pre-1980", "before1980", "pre1980"].includes(requestedYear);
    const displayYear = isBefore1980 ? "Before 1980" : rawYear;
    galleryYear.textContent = displayYear;
    document.title = `${displayYear} Photos | Vera Pachamanca`;
    const defaultGallery = document.getElementById("gallery-default");
    const beforeGallery = document.getElementById("gallery-before-1980");
    const beforeNotice = document.getElementById("gallery-before-notice");
    const showingBefore = isBefore1980;
    if (defaultGallery) defaultGallery.hidden = showingBefore;
    if (beforeGallery) beforeGallery.hidden = !showingBefore;
    if (beforeNotice) beforeNotice.hidden = !showingBefore;
  }

  // New gallery cards support local images and retain notes in the lightbox.
  document.querySelectorAll(".photo-record-image").forEach(item => {
    item.addEventListener("click", () => {
      if (!lightbox || !lightboxImage || !lightboxCaption) return;
      lightbox.classList.add("open");
      lightbox.setAttribute("aria-hidden", "false");
      lightboxCaption.textContent = item.dataset.lightboxCaption || "Family photo";
      const source = item.dataset.lightboxImage;
      if (source) {
        lightboxImage.style.background = "#111";
        lightboxImage.innerHTML = `<img src="${source}" alt="Expanded family photo">`;
      } else {
        lightboxImage.innerHTML = "";
        lightboxImage.style.background = getComputedStyle(item).background;
      }
    });
  });

  // Upload prototype: every selected image receives its own year and optional note.
  const buildYearOptions = (selected = "2026") => {
    const currentYear = new Date().getFullYear();
    const options = ['<option value="before-1980">Before 1980</option>'];
    for (let year = currentYear; year >= 1980; year -= 1) {
      options.push(`<option value="${year}"${String(year) === String(selected) ? " selected" : ""}>${year}</option>`);
    }
    return options.join("");
  };

  document.querySelectorAll(".photo-year-select").forEach(select => {
    select.innerHTML = buildYearOptions(select.dataset.selected || "2026");
  });

  const photoFiles = document.getElementById("photo-files");
  const previewList = document.getElementById("upload-preview-list");
  const uploadActionsText = document.querySelector(".upload-actions p");
  if (photoFiles && previewList) {
    photoFiles.addEventListener("change", () => {
      const files = Array.from(photoFiles.files || []);
      previewList.innerHTML = "";
      files.forEach((file, index) => {
        const card = document.createElement("article");
        card.className = "upload-preview-card";
        const objectUrl = URL.createObjectURL(file);
        card.innerHTML = `
          <div class="upload-preview-image"><img src="${objectUrl}" alt="Preview of ${file.name}"></div>
          <div class="upload-preview-fields">
            <div class="upload-file-heading"><strong>${file.name}</strong><button type="button" class="upload-remove">Remove</button></div>
            <label>Year<select class="photo-year-select">${buildYearOptions("2026")}</select></label>
            <label>Optional note<textarea rows="3" placeholder="Add a short note about this photo"></textarea></label>
          </div>`;
        card.querySelector(".upload-remove").addEventListener("click", () => {
          URL.revokeObjectURL(objectUrl);
          card.remove();
          const remaining = previewList.children.length;
          if (uploadActionsText) uploadActionsText.innerHTML = `<strong>${remaining} photo${remaining === 1 ? "" : "s"} ready.</strong> A new year will be created automatically if it does not already exist.`;
        });
        previewList.appendChild(card);
      });
      if (uploadActionsText) uploadActionsText.innerHTML = `<strong>${files.length} photo${files.length === 1 ? "" : "s"} ready.</strong> A new year will be created automatically if it does not already exist.`;
    });
  }

  // Static ownership preview: only the signed-in uploader sees edit/delete controls.
  document.querySelectorAll(".photo-edit-button").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".photo-record-card");
      const form = card?.querySelector(".photo-edit-form");
      if (form) form.hidden = false;
    });
  });
  document.querySelectorAll(".photo-cancel-button").forEach(button => {
    button.addEventListener("click", () => {
      const form = button.closest(".photo-edit-form");
      if (form) form.hidden = true;
    });
  });
  document.querySelectorAll(".photo-save-button").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".photo-record-card");
      const form = button.closest(".photo-edit-form");
      const note = form?.querySelector("textarea")?.value.trim();
      const noteDisplay = card?.querySelector(".photo-note");
      if (noteDisplay && note) noteDisplay.textContent = note;
      if (form) form.hidden = true;
      alert("Design preview: the API will save the new year and note.");
    });
  });
  document.querySelectorAll(".photo-delete-button").forEach(button => {
    button.addEventListener("click", () => {
      alert("Design preview: the API will verify ownership before deleting this photo.");
    });
  });

  document.getElementById("preview-upload-button")?.addEventListener("click", () => {
    alert("Design preview only. The API and storage upload will be connected after approval.");
  });

});
