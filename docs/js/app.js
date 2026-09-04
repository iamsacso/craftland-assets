const CATEGORIES = [
  { id: "all", label: "All", hint: "Every pack", icon: "◆" },
  { id: "model", label: "Model", hint: "3D objects", icon: "▣" },
  { id: "eca-script", label: "ECA Script", hint: "Logic packs", icon: "⌘" },
  { id: "ui", label: "UI", hint: "Menus & HUD", icon: "▦" },
  { id: "sound", label: "Sound", hint: "Audio packs", icon: "♫" },
  { id: "particle-emitter", label: "Particle", hint: "Emitters FX", icon: "✶" },
  { id: "others", label: "Others", hint: "Extra tools", icon: "●" },
];

const LABELS = {
  model: "Model",
  "eca-script": "ECA Script",
  ui: "UI",
  sound: "Sound",
  "particle-emitter": "Particle Emitter",
  others: "Others",
};

const ON_PAGES = location.hostname.endsWith("github.io");

const catsEl = document.getElementById("cats");
const gridEl = document.getElementById("grid");
const titleEl = document.getElementById("section-title");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");

let current = "all";
let query = "";

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderCats() {
  catsEl.innerHTML = CATEGORIES.map(
    (cat) => `
      <button class="cat ${cat.id === current ? "active" : ""}" data-id="${cat.id}" type="button">
        <span class="icon">${cat.icon}</span>
        <b>${cat.label}</b>
        <span>${cat.hint}</span>
      </button>
    `
  ).join("");
}

async function fetchAssets() {
  if (!ON_PAGES) {
    const params = new URLSearchParams();
    if (current !== "all") params.set("category", current);
    if (query) params.set("q", query);
    const res = await fetch(`/api/assets?${params.toString()}`);
    if (res.ok) return res.json();
  }

  const res = await fetch("data/assets.json");
  if (!res.ok) throw new Error("Could not load assets");
  let assets = await res.json();
  if (!Array.isArray(assets)) assets = [];
  if (current !== "all") {
    assets = assets.filter((item) => item.category === current);
  }
  if (query) {
    const needle = query.toLowerCase();
    assets = assets.filter((item) =>
      `${item.name} ${item.description || ""}`.toLowerCase().includes(needle)
    );
  }
  return assets;
}

function downloadHref(item) {
  if (ON_PAGES) return `uploads/files/${item.storedName}`;
  return `/api/download/${item.id}`;
}

function thumbSrc(item) {
  if (ON_PAGES) return `uploads/thumbs/${item.thumbName}`;
  return `/thumbs/${item.thumbName}`;
}

async function loadAssets() {
  const assets = await fetchAssets();
  const label = current === "all" ? "All assets" : LABELS[current];
  titleEl.textContent = label;
  countEl.textContent = `${assets.length} package${assets.length === 1 ? "" : "s"}`;

  if (!assets.length) {
    gridEl.innerHTML = `
      <div class="empty">
        <h3>Nothing here yet</h3>
        <p class="muted">When a Craftland package is uploaded, it will show up in this section.</p>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = assets
    .map((item) => {
      const thumb = item.thumbName
        ? `<img src="${thumbSrc(item)}" alt="">`
        : item.name.slice(0, 1).toUpperCase();
      return `
        <article class="card">
          <div class="thumb">${thumb}</div>
          <div class="card-body">
            <span class="tag">${LABELS[item.category] || item.category}</span>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.description || "Craftland studio package.")}</p>
            <div class="meta">
              <span>${formatSize(item.size)}</span>
              <span>${item.downloads || 0} downloads</span>
            </div>
            <a class="btn btn-primary" href="${downloadHref(item)}" download="${escapeHtml(item.originalName || item.name)}">Download</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

catsEl.addEventListener("click", (event) => {
  const btn = event.target.closest(".cat");
  if (!btn) return;
  current = btn.dataset.id;
  renderCats();
  loadAssets();
});

document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
});

searchEl.addEventListener("input", () => {
  query = searchEl.value.trim();
  loadAssets();
});

renderCats();
loadAssets().catch(() => {
  gridEl.innerHTML = `<div class="empty"><h3>Could not load assets</h3><p class="muted">Start the site with npm start, then refresh.</p></div>`;
});
