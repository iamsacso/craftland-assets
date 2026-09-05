const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "assets.json");
const FILES_DIR = path.join(ROOT, "uploads", "files");
const THUMBS_DIR = path.join(ROOT, "uploads", "thumbs");
const PUBLIC_DIR = path.join(ROOT, "public");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

loadEnv();

const CATEGORIES = [
  "model",
  "characters",
  "custom-object",
  "skybox",
  "eca-script",
  "ui",
  "sound",
  "particle-emitter",
  "others",
];

const FILE_EXT = new Set([
  ".package",
  ".zip",
  ".rar",
  ".7z",
  ".pak",
  ".json",
  ".lua",
  ".txt",
  ".mp3",
  ".wav",
  ".ogg",
  ".fbx",
  ".obj",
  ".gltf",
  ".glb",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const PORT = Number(process.env.PORT) || 4173;
const ADMIN_KEY = process.env.ADMIN_KEY || "craftland";

for (const dir of [
  path.join(ROOT, "data"),
  FILES_DIR,
  THUMBS_DIR,
]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]");
}

function readAssets() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAssets(assets) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(assets, null, 2));
}

function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function isAdmin(req) {
  const header = req.get("x-admin-key") || "";
  const query = req.query.key || "";
  return header === ADMIN_KEY || query === ADMIN_KEY;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === "thumb") {
      cb(null, THUMBS_DIR);
    } else {
      cb(null, FILES_DIR);
    }
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === "thumb") {
      return IMAGE_EXT.has(ext)
        ? cb(null, true)
        : cb(new Error("Preview must be png, jpg, jpeg, or webp."));
    }
    return FILE_EXT.has(ext)
      ? cb(null, true)
      : cb(new Error("This file type is not allowed."));
  },
});

const app = express();
app.use(express.json());
app.use("/files", express.static(FILES_DIR));
app.use("/thumbs", express.static(THUMBS_DIR));
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/assets", (req, res) => {
  const category = String(req.query.category || "").trim();
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  let assets = readAssets();
  if (CATEGORIES.includes(category)) {
    assets = assets.filter((item) => item.category === category);
  }
  if (q) {
    assets = assets.filter((item) => {
      const hay = `${item.name} ${item.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  assets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(assets);
});

app.get("/api/download/:id", (req, res) => {
  const assets = readAssets();
  const item = assets.find((asset) => asset.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Asset not found." });
  }
  const filePath = path.join(FILES_DIR, item.storedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File missing on server." });
  }
  item.downloads = (item.downloads || 0) + 1;
  writeAssets(assets);
  res.download(filePath, item.originalName || item.storedName);
});

app.post("/api/admin/login", (req, res) => {
  const key = String(req.body.key || "");
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Wrong admin key." });
  }
  res.json({ ok: true });
});

app.post(
  "/api/assets",
  (req, res, next) => {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "Admin key required." });
    }
    next();
  },
  upload.fields([
    { name: "package", maxCount: 1 },
    { name: "thumb", maxCount: 1 },
  ]),
  (req, res) => {
    const name = String(req.body.name || "").trim();
    const category = String(req.body.category || "").trim();
    const description = String(req.body.description || "").trim();
    const pack = req.files?.package?.[0];
    const thumb = req.files?.thumb?.[0];

    if (!name) {
      if (pack) safeUnlink(pack.path);
      if (thumb) safeUnlink(thumb.path);
      return res.status(400).json({ error: "Name is required." });
    }
    if (!CATEGORIES.includes(category)) {
      if (pack) safeUnlink(pack.path);
      if (thumb) safeUnlink(thumb.path);
      return res.status(400).json({ error: "Pick a valid category." });
    }
    if (!pack) {
      if (thumb) safeUnlink(thumb.path);
      return res.status(400).json({ error: "Upload a package file." });
    }

    const item = {
      id: crypto.randomUUID(),
      name,
      category,
      description,
      originalName: pack.originalname,
      storedName: pack.filename,
      size: pack.size,
      thumbName: thumb ? thumb.filename : "",
      downloads: 0,
      createdAt: new Date().toISOString(),
    };

    const assets = readAssets();
    assets.unshift(item);
    writeAssets(assets);
    res.status(201).json(item);
  }
);

app.delete("/api/assets/:id", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "Admin key required." });
  }
  const assets = readAssets();
  const index = assets.findIndex((asset) => asset.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Asset not found." });
  }
  const [removed] = assets.splice(index, 1);
  safeUnlink(path.join(FILES_DIR, removed.storedName));
  if (removed.thumbName) {
    safeUnlink(path.join(THUMBS_DIR, removed.thumbName));
  }
  writeAssets(assets);
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || "Upload failed." });
  }
  next();
});

const server = app.listen(PORT, () => {
  console.log(`Craftland Assets running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Set another PORT in .env`);
    process.exit(1);
  }
  throw err;
});
