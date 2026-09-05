const LABELS = {
  model: "Model",
  characters: "Characters",
  "custom-object": "Custom Object",
  "eca-script": "ECA Script",
  ui: "UI",
  sound: "Sound",
  "particle-emitter": "Particle Emitter",
  others: "Others",
};

const ON_PAGES = location.hostname.endsWith("github.io");
const loginCard = document.getElementById("login-card");
const studio = document.getElementById("studio");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const uploadForm = document.getElementById("upload-form");
const uploadMsg = document.getElementById("upload-msg");
const adminList = document.getElementById("admin-list");

function getToken() {
  return sessionStorage.getItem("craftland-github-token") || "";
}

function setToken(token) {
  sessionStorage.setItem("craftland-github-token", token);
}

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

function setupLoginCopy() {
  if (!ON_PAGES) return;
  document.getElementById("login-title").textContent = "GitHub token";
  document.getElementById("login-help").innerHTML =
    'Uploads on the live site use a GitHub token. <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=Craftland%20Assets" target="_blank" rel="noreferrer">Create a token</a> (enable public_repo), copy it, and paste it below.';
  document.getElementById("key-label-text").textContent = "Token";
}

async function login(secret) {
  if (ON_PAGES) {
    await GitHubStore.verify(secret);
    setToken(secret);
    showStudio();
    return;
  }
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: secret }),
  });
  if (!res.ok) {
    throw new Error("Wrong admin key.");
  }
  setKey(secret);
  showStudio();
}

async function loadList() {
  let assets = [];
  if (ON_PAGES) {
    assets = await GitHubStore.readAssets(getToken());
  } else {
    const res = await fetch("/api/assets");
    assets = await res.json();
  }
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
    await login(document.getElementById("admin-key").value.trim());
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
  try {
    if (ON_PAGES) {
      await publishToGitHub();
    } else {
      const data = new FormData(uploadForm);
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "x-admin-key": getKey() },
        body: data,
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Upload failed.");
    }
    uploadForm.reset();
    uploadMsg.className = "ok";
    uploadMsg.textContent = ON_PAGES
      ? "Published. The website will update in 1–2 minutes."
      : "Package published.";
    loadList();
  } catch (err) {
    uploadMsg.className = "error";
    uploadMsg.textContent = err.message;
  }
});

async function publishToGitHub() {
  const form = new FormData(uploadForm);
  const name = String(form.get("name") || "").trim();
  const category = String(form.get("category") || "").trim();
  const description = String(form.get("description") || "").trim();
  const pack = form.get("package");
  const thumb = form.get("thumb");
  if (!name) throw new Error("Name is required.");
  if (!pack || !pack.size) throw new Error("Upload a package file.");
  if (pack.size > 50 * 1024 * 1024) {
    throw new Error("File too large for GitHub upload (max 50 MB).");
  }

  const storedName = randomName(pack.name || "asset.package");
  const thumbName =
    thumb && thumb.size ? randomName(thumb.name || "preview.png") : "";
  const item = {
    id: crypto.randomUUID(),
    name,
    category,
    description,
    originalName: pack.name,
    storedName,
    size: pack.size,
    thumbName,
    downloads: 0,
    createdAt: new Date().toISOString(),
  };

  const assets = await GitHubStore.readAssets(getToken());
  assets.unshift(item);
  const json = `${JSON.stringify(assets, null, 2)}\n`;
  const packB64 = await fileToBase64(pack);
  const files = [
    { path: `docs/uploads/files/${storedName}`, base64: packB64 },
    { path: `uploads/files/${storedName}`, base64: packB64 },
    { path: "docs/data/assets.json", base64: textToBase64(json) },
    { path: "data/assets.json", base64: textToBase64(json) },
  ];
  if (thumb && thumb.size) {
    const thumbB64 = await fileToBase64(thumb);
    files.push({ path: `docs/uploads/thumbs/${thumbName}`, base64: thumbB64 });
    files.push({ path: `uploads/thumbs/${thumbName}`, base64: thumbB64 });
  }
  await GitHubStore.commitFiles(
    getToken(),
    `Add ${name} to Craftland Assets`,
    files
  );
}

adminList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-id]");
  if (!btn) return;
  if (!confirm("Delete this package?")) return;
  try {
    if (ON_PAGES) {
      const assets = await GitHubStore.readAssets(getToken());
      const removed = assets.find((item) => item.id === btn.dataset.id);
      if (!removed) return;
      const next = assets.filter((item) => item.id !== btn.dataset.id);
      const json = `${JSON.stringify(next, null, 2)}\n`;
      const files = [
        { path: "docs/data/assets.json", base64: textToBase64(json) },
        { path: "data/assets.json", base64: textToBase64(json) },
        { path: `docs/uploads/files/${removed.storedName}`, delete: true },
        { path: `uploads/files/${removed.storedName}`, delete: true },
      ];
      if (removed.thumbName) {
        files.push({
          path: `docs/uploads/thumbs/${removed.thumbName}`,
          delete: true,
        });
        files.push({
          path: `uploads/thumbs/${removed.thumbName}`,
          delete: true,
        });
      }
      await GitHubStore.commitFiles(
        getToken(),
        `Remove ${removed.name} from Craftland Assets`,
        files
      );
    } else {
      const res = await fetch(`/api/assets/${btn.dataset.id}`, {
        method: "DELETE",
        headers: { "x-admin-key": getKey() },
      });
      if (!res.ok) throw new Error("Delete failed.");
    }
    loadList();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("logout").addEventListener("click", () => {
  sessionStorage.removeItem("craftland-admin-key");
  sessionStorage.removeItem("craftland-github-token");
  studio.hidden = true;
  loginCard.hidden = false;
});

setupLoginCopy();

const saved = ON_PAGES ? getToken() : getKey();
if (saved) {
  login(saved).catch(() => {
    sessionStorage.removeItem("craftland-admin-key");
    sessionStorage.removeItem("craftland-github-token");
  });
}
