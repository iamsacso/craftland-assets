const LABELS = {
  model: "Model",
  "eca-script": "ECA Script",
  ui: "UI",
  sound: "Sound",
  "particle-emitter": "Particle Emitter",
  others: "Others",
};

const loginCard = document.getElementById("login-card");
const studio = document.getElementById("studio");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const uploadForm = document.getElementById("upload-form");
const uploadMsg = document.getElementById("upload-msg");
const adminList = document.getElementById("admin-list");

function getKey() {
  return sessionStorage.getItem("craftland-admin-key") || "";
}

function setKey(key) {
  sessionStorage.setItem("craftland-admin-key", key);
}

function showStudio() {
  loginCard.hidden = true;
  studio.hidden = false;
  loadList();
}

async function login(key) {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    throw new Error("Wrong admin key.");
  }
  setKey(key);
  showStudio();
}

async function loadList() {
  const res = await fetch("/api/assets");
  const assets = await res.json();
  if (!assets.length) {
    adminList.innerHTML = `<p class="muted">No packages published yet.</p>`;
    return;
  }
  adminList.innerHTML = assets
    .map(
      (item) => `
      <div class="admin-item">
        <div>
          <b>${escapeHtml(item.name)}</b>
          <div class="muted">${LABELS[item.category] || item.category}</div>
        </div>
        <button class="btn btn-danger" data-id="${item.id}" type="button">Delete</button>
      </div>
    `
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  try {
    await login(document.getElementById("admin-key").value);
  } catch (err) {
    loginError.hidden = false;
    loginError.textContent = err.message;
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  uploadMsg.hidden = false;
  uploadMsg.className = "muted";
  uploadMsg.textContent = "Uploading...";
  const data = new FormData(uploadForm);
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "x-admin-key": getKey() },
    body: data,
  });
  const payload = await res.json();
  if (!res.ok) {
    uploadMsg.className = "error";
    uploadMsg.textContent = payload.error || "Upload failed.";
    return;
  }
  uploadForm.reset();
  uploadMsg.className = "ok";
  uploadMsg.textContent = "Package published.";
  loadList();
});

adminList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-id]");
  if (!btn) return;
  if (!confirm("Delete this package?")) return;
  const res = await fetch(`/api/assets/${btn.dataset.id}`, {
    method: "DELETE",
    headers: { "x-admin-key": getKey() },
  });
  if (res.ok) loadList();
});

document.getElementById("logout").addEventListener("click", () => {
  sessionStorage.removeItem("craftland-admin-key");
  studio.hidden = true;
  loginCard.hidden = false;
});

if (getKey()) {
  login(getKey()).catch(() => {
    sessionStorage.removeItem("craftland-admin-key");
  });
}
