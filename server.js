import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import OpenAI from "openai";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const tmpDir = path.join(dataDir, "tmp");
const libraryFile = path.join(dataDir, "travel.json");
const legacyTripFile = path.join(dataDir, "trip.json");
const adminPassword = process.env.ADMIN_PASSWORD || "amy-travel";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const samplePhotos = [
  { src: "/assets/photo-01.svg", caption: "示例照片 01", orientation: "landscape" },
  { src: "/assets/photo-02.svg", caption: "示例照片 02", orientation: "landscape" },
  { src: "/assets/photo-03.svg", caption: "示例照片 03", orientation: "landscape" },
  { src: "/assets/photo-04.svg", caption: "示例照片 04", orientation: "portrait" },
  { src: "/assets/photo-05.svg", caption: "示例照片 05", orientation: "landscape" },
  { src: "/assets/photo-06.svg", caption: "示例照片 06", orientation: "landscape" }
];

const defaultLibrary = {
  siteTitle: "Amy Travel",
  albums: [
    {
      id: "sample",
      title: "Amy Travel",
      year: "2026",
      intro: "A visual notebook for places, light, rooms, meals, roads, and quiet family moments.",
      originalIntro: "",
      photos: samplePhotos,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      isSample: true
    }
  ]
};

const upload = multer({
  dest: tmpDir,
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 30
  },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.mimetype)) {
      cb(new Error("Only JPG, PNG, and WEBP images are supported."));
      return;
    }
    cb(null, true);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir, { maxAge: "1h", etag: true }));

app.get("/api/trip", async (_req, res) => {
  const library = await readLibrary();
  res.json(latestAlbum(library));
});

app.get("/api/albums", async (_req, res) => {
  res.json(await readLibrary());
});

app.post("/api/admin/trip", requireAdmin, upload.array("photos", 30), async (req, res) => {
  const library = await readLibrary();
  const rawTitle = clean(req.body.title) || "Untitled Trip";
  const rawYear = clean(req.body.year) || new Date().getFullYear().toString();
  const rawIntro = clean(req.body.intro) || "";
  const polishedIntro = await polishIntro(rawTitle, rawIntro);
  const uploadedFiles = req.files || [];
  const photos = [];

  for (const file of uploadedFiles) {
    const filename = await nextFilename();
    const finalPath = path.join(uploadDir, filename);
    const metadata = await optimizeImage(file.path, finalPath);
    await fs.unlink(file.path).catch(() => {});
    photos.push({
      id: cryptoRandomId(),
      src: `/uploads/${filename}`,
      caption: `Frame ${String(photos.length + 1).padStart(2, "0")}`,
      width: metadata.width,
      height: metadata.height,
      orientation: metadata.height > metadata.width ? "portrait" : "landscape"
    });
  }

  const album = {
    id: cryptoRandomId(),
    title: rawTitle,
    year: rawYear,
    intro: polishedIntro,
    originalIntro: rawIntro,
    photos,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const albums = [...(library.albums || []).filter((item) => !item.isSample), album];
  const nextLibrary = { siteTitle: "Amy Travel", albums };
  await writeLibrary(nextLibrary);
  res.json({ ok: true, album, library: nextLibrary, trip: album });
});

app.delete("/api/admin/albums/:albumId", requireAdmin, async (req, res) => {
  const library = await readLibrary();
  const album = (library.albums || []).find((item) => item.id === req.params.albumId);
  if (!album) {
    res.status(404).json({ ok: false, error: "Album not found." });
    return;
  }

  for (const photo of album.photos || []) {
    await deleteUploadedFile(photo.src);
  }

  const albums = (library.albums || []).filter((item) => item.id !== req.params.albumId);
  const nextLibrary = { siteTitle: "Amy Travel", albums: albums.length ? albums : defaultLibrary.albums };
  await writeLibrary(nextLibrary);
  res.json({ ok: true, library: nextLibrary });
});

app.delete("/api/admin/photos/:photoId", requireAdmin, async (req, res) => {
  const library = await readLibrary();
  let removedPhoto = null;
  const albums = (library.albums || []).map((album) => {
    const photos = (album.photos || []).filter((photo) => {
      if (photo.id === req.params.photoId) {
        removedPhoto = photo;
        return false;
      }
      return true;
    });
    return { ...album, photos, updatedAt: new Date().toISOString() };
  });

  if (!removedPhoto) {
    res.status(404).json({ ok: false, error: "Photo not found." });
    return;
  }

  await deleteUploadedFile(removedPhoto.src);
  const nextLibrary = { siteTitle: "Amy Travel", albums };
  await writeLibrary(nextLibrary);
  res.json({ ok: true, library: nextLibrary });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function initStorage() {
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  if (!(await exists(libraryFile))) {
    const legacyTrip = await readJsonIfExists(legacyTripFile);
    if (legacyTrip?.title || legacyTrip?.photos) {
      await writeLibrary({
        siteTitle: "Amy Travel",
        albums: [
          {
            id: cryptoRandomId(),
            title: legacyTrip.title || "Imported Trip",
            year: legacyTrip.year || "2026",
            intro: legacyTrip.intro || "",
            originalIntro: legacyTrip.originalIntro || legacyTrip.intro || "",
            photos: (legacyTrip.photos || []).map((photo, index) => ({
              id: cryptoRandomId(),
              caption: `Frame ${String(index + 1).padStart(2, "0")}`,
              orientation: photo.orientation || "landscape",
              ...photo
            })),
            createdAt: legacyTrip.updatedAt || new Date().toISOString(),
            updatedAt: legacyTrip.updatedAt || new Date().toISOString()
          }
        ]
      });
    } else {
      await writeLibrary(defaultLibrary);
    }
  }
}

async function readLibrary() {
  const library = await readJsonIfExists(libraryFile);
  if (!library) return defaultLibrary;
  const albums = Array.isArray(library.albums) ? library.albums : [];
  return {
    siteTitle: library.siteTitle || "Amy Travel",
    albums: albums.length ? albums.map(normalizeAlbum) : defaultLibrary.albums
  };
}

async function writeLibrary(library) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(libraryFile, JSON.stringify(library, null, 2), "utf8");
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const password = req.get("x-admin-password") || req.body?.password;
  if (!password || password !== adminPassword) {
    res.status(401).json({ ok: false, error: "Password is incorrect." });
    return;
  }
  next();
}

async function nextFilename() {
  const day = formatFileDate(new Date());
  const files = await fs.readdir(uploadDir).catch(() => []);
  const prefix = `amy-travel-${day}-`;
  const numbers = files
    .filter((name) => name.startsWith(prefix))
    .map((name) => Number(name.slice(prefix.length, prefix.length + 2)))
    .filter(Number.isFinite);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `${prefix}${String(next).padStart(2, "0")}.jpg`;
}

async function optimizeImage(sourcePath, targetPath) {
  const info = await sharp(sourcePath)
    .rotate()
    .resize({
      width: 2000,
      height: 2000,
      fit: "inside",
      withoutEnlargement: true
    })
    .jpeg({
      quality: 82,
      mozjpeg: true
    })
    .toFile(targetPath);
  return info;
}

async function polishIntro(title, intro) {
  if (!intro || !openai) return intro || "这次旅行的照片已经整理进 Amy Travel。";

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "你是一个高级旅行影像集编辑。请把用户朴素的中文旅行介绍润色成自然、克制、有画面感的中文。风格像私人影像集的前言：具体、温柔、不过度抒情，不要营销腔。保留真实信息，可以补一点节奏和画面。80到140字。"
        },
        {
          role: "user",
          content: `旅行标题：${title}\n原始介绍：${intro}`
        }
      ],
      max_tokens: 180,
      temperature: 0.7
    });

    return clean(response.choices?.[0]?.message?.content) || intro;
  } catch (error) {
    console.warn("Intro polishing failed:", error.message);
    return intro;
  }
}

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function formatFileDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function normalizeAlbum(album) {
  return {
    id: album.id || cryptoRandomId(),
    title: album.title || "Untitled Trip",
    year: album.year || "2026",
    intro: album.intro || "",
    originalIntro: album.originalIntro || album.intro || "",
    photos: (album.photos || []).map((photo, index) => ({
      id: photo.id || cryptoRandomId(),
      src: photo.src,
      caption: photo.caption?.startsWith("示例") ? photo.caption : `Frame ${String(index + 1).padStart(2, "0")}`,
      width: photo.width || null,
      height: photo.height || null,
      orientation: photo.orientation || "landscape"
    })).filter((photo) => photo.src),
    createdAt: album.createdAt || new Date().toISOString(),
    updatedAt: album.updatedAt || album.createdAt || new Date().toISOString(),
    isSample: Boolean(album.isSample)
  };
}

function latestAlbum(library) {
  return [...(library.albums || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || defaultLibrary.albums[0];
}

async function deleteUploadedFile(src) {
  if (!src || !src.startsWith("/uploads/")) return;
  const filename = path.basename(src);
  await fs.unlink(path.join(uploadDir, filename)).catch(() => {});
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

initStorage()
  .then(() => {
    app.listen(port, () => {
      console.log(`Amy Travel is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
