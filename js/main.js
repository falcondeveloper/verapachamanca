
document.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (menuButton && nav) {
    // Keep Family Tree as a top-level navigation option on every page.
    if (!nav.querySelector('a[href="family-tree.html"]')) {
      const familyTreeLink = document.createElement("a");
      familyTreeLink.href = "family-tree.html";
      familyTreeLink.textContent = "Family Tree";
      const photosLink = nav.querySelector('a[href="photos.html"]');
      if (photosLink) {
        photosLink.insertAdjacentElement("afterend", familyTreeLink);
      } else {
        nav.prepend(familyTreeLink);
      }
    }

    // Mobile-only discoverability hint. Show once per browser session for 3 seconds.
    if (window.matchMedia("(max-width: 900px)").matches) {
      let alreadyShown = false;
      try {
        alreadyShown = sessionStorage.getItem("vera-menu-hint-shown") === "1";
      } catch (_) {}

      if (!alreadyShown) {
        const hint = document.createElement("small");
        hint.className = "menu-callout";
        hint.setAttribute("aria-hidden", "true");
        hint.textContent = "Tap MENU for more options";
        menuButton.appendChild(hint);

        try {
          sessionStorage.setItem("vera-menu-hint-shown", "1");
        } catch (_) {}

        window.setTimeout(() => {
          hint.classList.add("menu-callout-hide");
          window.setTimeout(() => hint.remove(), 350);
        }, 3000);
      }
    }
    menuButton.addEventListener("click", () => {
      menuButton.querySelector(".menu-callout")?.remove();
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
    const showingBefore = isBefore1980;
    if (defaultGallery) defaultGallery.hidden = showingBefore;
    if (beforeGallery) beforeGallery.hidden = !showingBefore;
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


});
