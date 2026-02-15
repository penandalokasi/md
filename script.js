/* ===== MD Gallery (GitHub Pages-friendly) =====
   Core rules:
   - "Copy URL" must copy the ABSOLUTE public URL to the ORIGINAL file in /images/
   - Originals must NOT be loaded in the UI (only thumbnails + optimized assets)
   - Works on GitHub Pages project sites (no hardcoded repo name)
*/

const gallery = document.getElementById("gallery");
const lightbox = document.getElementById("lightbox");
const yearFilterRoot = document.getElementById("yearFilter");
const yearBtn = document.getElementById("yearBtn");
const yearLabel = document.getElementById("yearLabel");
const yearMenu = document.getElementById("yearMenu");
const countLabel = document.getElementById("countLabel");

let allItems = [];
let filteredItems = [];
let currentIndex = 0;
let selectedYear = "ALL";

const swipeThreshold = 50;
let touchStartX = 0;
let touchStartY = 0;

// Lightbox focus management (restore focus after closing)
let lastActiveEl = null;

/* ---------- Utilities ---------- */

function absUrl(relativePath) {
  // Produces a fully-qualified URL as served from the current project subpath.
  // Example on GitHub Pages project site: https://<user>.github.io/<repo>/
  return new URL(relativePath, window.location.href).toString();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[s]));
}

function basename(p = "") {
  return String(p).split("/").pop() || "";
}

function yearFromItem(item) {
  const name = basename(item?.original || "");
  const m = name.match(/^(\d{4})[-_.]/);
  return m?.[1] || null;
}

function setStatus(text) {
  gallery.innerHTML = `<div class="status">${escapeHtml(String(text))}</div>`;
  countLabel.textContent = "";
}

/* ---------- Load index.json ---------- */

async function loadIndex() {
  try {
    const res = await fetch("index.json", { cache: "no-store" });
    if (!res.ok) throw new Error("index.json not found");
    const files = await res.json();
    if (!Array.isArray(files)) throw new Error("index.json format error");

    allItems = files
      .filter(Boolean)
      .sort((a, b) => String(b?.original ?? "").localeCompare(String(a?.original ?? "")));

    if (!allItems.length) throw new Error("No items found in index.json");

    buildYearFilter(allItems);
    selectedYear = "ALL";
    if (yearLabel) yearLabel.textContent = "All years";
    applyFiltersAndRender();
  } catch (err) {
    setStatus(err?.message ?? err);
  }
}

loadIndex();

/* ---------- Filter ---------- */

function buildYearFilter(items) {
  const years = new Set();
  for (const it of items) {
    const y = yearFromItem(it);
    if (y) years.add(y);
  }
  const sorted = [...years].sort((a, b) => Number(b) - Number(a));
  buildYearMenu(sorted);
}

function buildYearMenu(years) {
  if (!yearMenu || !yearBtn || !yearLabel) return;
  yearMenu.innerHTML = "";

  const addOption = (label, value) => {
    const b = document.createElement("button");
    b.className = "yearOption";
    b.type = "button";
    b.setAttribute("role", "option");
    b.dataset.value = value;
    b.setAttribute("aria-selected", selectedYear === value ? "true" : "false");
    b.textContent = label;
    b.addEventListener("click", () => {
      selectedYear = value;
      yearLabel.textContent = label;
      updateYearOptionSelection();
      closeYearMenu();
      applyFiltersAndRender();
    });
    yearMenu.appendChild(b);
  };

  addOption("All years", "ALL");
  for (const y of years) addOption(String(y), String(y));

  yearMenu.setAttribute("aria-hidden", "true");
}

function updateYearOptionSelection() {
  if (!yearMenu) return;
  for (const opt of yearMenu.querySelectorAll(".yearOption")) {
    const v = opt.dataset.value;
    opt.setAttribute("aria-selected", v === selectedYear ? "true" : "false");
  }
}

function openYearMenu() {
  if (!yearMenu || !yearBtn) return;
  yearBtn.setAttribute("aria-expanded", "true");
  yearMenu.setAttribute("aria-hidden", "false");

  // Focus the selected option for easier keyboard use.
  const opts = [...yearMenu.querySelectorAll(".yearOption")];
  const selected = opts.find(o => o.dataset.value === selectedYear) || opts[0];
  selected?.focus?.({ preventScroll: true });
}

function closeYearMenu() {
  if (!yearMenu || !yearBtn) return;
  yearBtn.setAttribute("aria-expanded", "false");
  yearMenu.setAttribute("aria-hidden", "true");
}

if (yearBtn) {
  yearBtn.addEventListener("click", () => {
    const open = yearMenu?.getAttribute("aria-hidden") === "false";
    open ? closeYearMenu() : openYearMenu();
  });

  document.addEventListener("click", (e) => {
    if (!yearFilterRoot?.contains(e.target)) closeYearMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeYearMenu();
  });
}

function applyFiltersAndRender() {
  filteredItems = (selectedYear !== "ALL")
    ? allItems.filter(it => yearFromItem(it) === selectedYear)
    : [...allItems];

  renderGallery(filteredItems);
  countLabel.textContent = `${filteredItems.length.toLocaleString()} item${filteredItems.length === 1 ? "" : "s"}`;
}


/* ---------- Lazy thumbnails (including video thumbs) ---------- */

const supportsIO = typeof IntersectionObserver !== "undefined";

const io = supportsIO
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      const src = el.getAttribute("data-src");
      if (src) {
        el.setAttribute("src", src);

        // Some browsers need an explicit load/play after setting src on <video>.
        if (el.tagName === "VIDEO") {
          try { el.load?.(); } catch {}
          try { el.play?.().catch?.(() => {}); } catch {}
        }
      }
      el.removeAttribute("data-src");
      io.unobserve(el);
    }
  }, { rootMargin: "250px 0px" })
  : null;

function observeLazy(el) {
  // Native lazy-load for <img> is fine; we mainly need this for <video>.
  if (!el) return;
  if (el.tagName !== "VIDEO") return;

  // Fallback for browsers without IntersectionObserver
  if (!supportsIO) {
    const src = el.getAttribute("data-src");
    if (src) {
      el.setAttribute("src", src);
      el.removeAttribute("data-src");
      try { el.load?.(); } catch {}
      try { el.play?.().catch?.(() => {}); } catch {}
    }
    return;
  }

  io.observe(el);
}

/* ---------- Gallery ---------- */

function renderGallery(items) {
  gallery.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    gallery.appendChild(createCard(items[i], i));
  }
}

function createCard(item, index) {
  const container = document.createElement("div");
  container.className = "item";

  const isWebm = item.format === "webm";

  if (isWebm) {
    const video = document.createElement("video");
    // lazy: use data-src and IntersectionObserver
    video.setAttribute("data-src", item.thumbnail?.webm ?? "");
    video.preload = "none";
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.className = "thumb-media";
    video.addEventListener("click", () => openLightbox(index));
    container.appendChild(video);
    observeLazy(video);
  } else {
    const picture = document.createElement("picture");

    if (item.thumbnail?.avif) {
      const avif = document.createElement("source");
      avif.type = "image/avif";
      avif.srcset = item.thumbnail.avif;
      picture.appendChild(avif);
    }

    if (item.thumbnail?.webp) {
      const webp = document.createElement("source");
      webp.type = "image/webp";
      webp.srcset = item.thumbnail.webp;
      picture.appendChild(webp);
    }

    const img = document.createElement("img");
    // Use smallest/fallback thumb if present (prefer jpg/png fallback, then webp).
    img.src = item.thumbnail?.jpg ?? item.thumbnail?.png ?? item.thumbnail?.webp ?? "";
    img.alt = basename(item.original) || "image";
    img.draggable = false;
    img.loading = "lazy";
    img.decoding = "async";
    img.className = "thumb-media";
    img.addEventListener("click", () => openLightbox(index));

    picture.appendChild(img);
    container.appendChild(picture);
  }

  const btn = document.createElement("button");
  btn.className = "item__btn";
  btn.type = "button";
  btn.textContent = "Copy URL";
  btn.setAttribute("aria-label", "Copy original image URL");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyOriginalUrl(item, btn);
  });

  container.appendChild(btn);
  return container;
}

/* ---------- Copy URL (ORIGINAL only) ---------- */

async function copyOriginalUrl(item, btn) {
  const toCopy = absUrl(item.original ?? "");
  try {
    await navigator.clipboard.writeText(toCopy);
    if (btn) toastButton(btn, "Copied");
  } catch {
    prompt("Copy this URL:", toCopy);
  }
}

function toastButton(btn, text) {
  const prev = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = prev;
    btn.disabled = false;
  }, 1100);
}

/* ---------- Lightbox ---------- */

function openLightbox(index) {
  lastActiveEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  currentIndex = index;

  const item = filteredItems[currentIndex];
  if (!item) return;

  const title = basename(item.original);
  const originalUrl = absUrl(item.original ?? "");

  lightbox.innerHTML = `
    <div class="lightbox__panel" role="document">
      <div class="lightbox__bar">
        <div class="lightbox__title">
          <div class="lightbox__name" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
          <div class="lightbox__hint">←/→ navigate · Esc close · Copy URL copies original link</div>
        </div>
        <div class="lightbox__actions">
          <button class="btn btn--primary" id="lbCopy">Copy URL</button>
          <a class="btn" id="lbOpen" href="${escapeHtml(originalUrl)}" target="_blank" rel="noopener noreferrer">Open original</a>
          <button class="btn btn--ghost" id="lbClose">Close</button>
        </div>
      </div>

      <div class="lightbox__stage" id="lbStage"></div>

      <div class="lightbox__nav" aria-hidden="true">
        <button class="prev" id="lbPrev" title="Previous (←)">←</button>
        <button class="next" id="lbNext" title="Next (→)">→</button>
      </div>
    </div>
  `;

  // Insert optimized media ONLY when opening.
  const stage = document.getElementById("lbStage");
  stage.appendChild(createLightboxMedia(item));

  // Wire actions
  document.getElementById("lbClose").addEventListener("click", closeLightbox);
  document.getElementById("lbCopy").addEventListener("click", () => copyOriginalUrl(item, document.getElementById("lbCopy")));
  document.getElementById("lbPrev").addEventListener("click", () => go(-1));
  document.getElementById("lbNext").addEventListener("click", () => go(1));

  // Allow clicking outside panel to close
  lightbox.addEventListener("click", onBackdropClick);
  // Keyboard + swipe
  document.addEventListener("keydown", onKeyDown);
  lightbox.addEventListener("touchstart", onTouchStart, { passive: true });
  lightbox.addEventListener("touchend", onTouchEnd, { passive: true });

  lightbox.classList.remove("hidden");

  // Prevent background scroll while the modal is open.
  document.documentElement.classList.add("modal-open");

  // Focus close button for accessibility
  document.getElementById("lbClose").focus({ preventScroll: true });
}

function createLightboxMedia(item) {
  if (item.format === "webm") {
    const video = document.createElement("video");
    video.src = item.optimized?.webm ?? "";
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.className = "lightbox__media";
    return video;
  }

  const picture = document.createElement("picture");

  if (item.optimized?.avif) {
    const avif = document.createElement("source");
    avif.type = "image/avif";
    avif.srcset = item.optimized.avif;
    picture.appendChild(avif);
  }
  if (item.optimized?.webp) {
    const webp = document.createElement("source");
    webp.type = "image/webp";
    webp.srcset = item.optimized.webp;
    picture.appendChild(webp);
  }

  const img = document.createElement("img");
  img.src = item.optimized?.jpg ?? item.optimized?.png ?? item.optimized?.webp ?? "";
  img.alt = basename(item.original) || "image";
  img.decoding = "async";
  img.className = "lightbox__media";

  picture.appendChild(img);
  return picture;
}

function closeLightbox() {
  lightbox.classList.add("hidden");
  lightbox.innerHTML = "";

  lightbox.removeEventListener("click", onBackdropClick);
  document.removeEventListener("keydown", onKeyDown);
  lightbox.removeEventListener("touchstart", onTouchStart);
  lightbox.removeEventListener("touchend", onTouchEnd);

  document.documentElement.classList.remove("modal-open");

  // Restore focus to wherever the user was.
  if (lastActiveEl && lastActiveEl.isConnected) {
    try { lastActiveEl.focus({ preventScroll: true }); } catch {}
  }
  lastActiveEl = null;
}

function onBackdropClick(e) {
  // Close when clicking the dark backdrop (not the panel)
  if (e.target === lightbox) closeLightbox();
}

function onKeyDown(e) {
  if (lightbox.classList.contains("hidden")) return;

  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") go(-1);
  if (e.key === "ArrowRight") go(1);
}

function go(delta) {
  const next = currentIndex + delta;
  if (next < 0 || next >= filteredItems.length) return;
  closeLightbox();
  openLightbox(next);
}

function onTouchStart(e) {
  const t = e.touches?.[0];
  if (!t) return;
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}

function onTouchEnd(e) {
  const t = e.changedTouches?.[0];
  if (!t) return;
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > swipeThreshold) {
    if (dx > 0) go(-1);
    else go(1);
  }
}
