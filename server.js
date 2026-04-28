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
  { type: "image", src: "/assets/photo-01.svg", caption: "Frame 01", orientation: "landscape" },
  { type: "image", src: "/assets/photo-02.svg", caption: "Frame 02", orientation: "landscape" },
  { type: "image", src: "/assets/photo-03.svg", caption: "Frame 03", orientation: "landscape" },
  { type: "image", src: "/assets/photo-04.svg", caption: "Frame 04", orientation: "portrait" }
];

const defaultLibrary = {
  siteTitle: "Amy Travel",
  videos: [],
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
    fileSize: 200 * 1024 * 1024,
    files: 40
  },
  fileFilter: (_req, file, cb) => {
    const okImage = /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
    const okVideo = /^video\/(mp4|quicktime|webm)$/i.test(file.mimetype);
    if (!okImage && !okVideo) {
      cb(new Error("Only JPG, PNG, WEBP, MP4, MOV, and WEBM files are supported."));
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

app.post("/api/admin/trip", requireAdmin, upload.array("media", 40), async (req, res) => {
  const library = await readLibrary();
  const rawTitle = clean(req.body.title) || "Untitled Trip";
  const rawYear = clean(req.body.year) || new Date().getFullYear().toString();
  const rawIntro = clean(req.body.intro) || "";
  const polishedIntro = await polishIntro(rawTitle, rawIntro);
  const media = await processUploadedFiles(req.files || []);

  const album = {
    id: cryptoRandomId(),
    title: rawTitle,
    year: rawYear,
    intro: polishedIntro,
    originalIntro: rawIntro,
    photos: media.map((item, index) => ({
      ...item,
      caption: item.type === "video" ? `Motion ${String(index + 1).padStart(2, "0")}` : `Frame ${String(index + 1).padStart(2, "0")}`
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const albums = [...(library.albums || []).filter((item) => !item.isSample), album];
  const nextLibrary = { ...library, siteTitle: "Amy Travel", albums };
  await writeLibrary(nextLibrary);
  res.json({ ok: true, album, library: nextLibrary, trip: album });
});

app.post("/api/admin/albums/:albumId/media", requireAdmin, upload.array("media", 40), async (req, res) => {
  const library = await readLibrary();
  const media = await processUploadedFiles(req.files || []);
  let found = false;

  const albums = (library.albums || []).map((album) => {
    if (album.id !== req.params.albumId) return album;
    found = true;
    const existing = album.photos || [];
    const additions = media.map((item, index) => ({
      ...item,
      caption: item.type === "video"
        ? `Motion ${String(existing.length + index + 1).padStart(2, "0")}`
        : `Frame ${String(existing.length + index + 1).padStart(2, "0")}`
    }));
    return { ...album, photos: [...existing, ...additions], updatedAt: new Date().toISOString() };
  });

  if (!found) {
    res.status(404).json({ ok: false, error: "Album not found." });
    return;
  }

  const nextLibrary = { ...library, albums };
  await writeLibrary(nextLibrary);
  res.json({ ok: true, library: nextLibrary });
});

app.post("/api/admin/videos", requireAdmin, upload.array("media", 30), async (req, res) => {
  const library = await readLibrary();
  const media = (await processUploadedFiles(req.files || [])).filter((item) => item.type === "video");
  const existing = library.videos || [];
  const videos = [
    ...existing,
    ...media.map((item, index) => ({
      ...item,
      title: `Motion ${String(existing.length + index + 1).padStart(2, "0")}`,
      caption: `Motion ${String(existing.length + index + 1).padStart(2, "0")}`
    }))
  ];
  const nextLibrary = { ...library, videos };
  await writeLibrary(nextLibrary);
  res.json({ ok: true, library: nextLibrary });
});

app.delete("/api/admin/albums/:albumId", requireAdmin, async (req, res) => {
  const library = await readLibrary();
  const album = (library.albums || []).find((item) => item.id === req.params.albumId);
  if (!album) {
    res.status(404).json({ ok: false, error: "Album not found." });
    return;
  }

  for (const item of album.photos || []) {
    await deleteUploadedFile(item.src);
  }

  const albums = (library.albums || []).filter((item) => item.id !== req.params.albumId);
  const nextLibrary = { ...library, albums: albums.length ? albums : defaultLibrary.albums };
  await writeLibrary(nextLibrary);
  res.json({ ok: true, library: nextLibrary });
});

app.delete("/api/admin/photos/:photoId", requireAdmin, async (req, res) => {
  const library = await readLibrary();
  let removed = null;
  const albums = (library.albums || []).map((album) => {
    const photos = (album.photos || []).filter((item) => {
      if (item.id === req.params.photoId) {
        removed = item;
        return false;
      }
      return true;
    });
    return { ...album, photos, updatedAt: new Date().toISOString() };
  });

  if (!removed) {
    res.status(404).json({ ok: false, error: "Media not found." });
    return;
  }

  await deleteUploadedFile(removed.src);
  const nextLibrary = { ...library, albums };
  await writeLibrary(nextLibrary);
  res.json({ ok: true, library: nextLibrary });
});

app.delete("/api/admin/videos/:videoId", requireAdmin, async (req, res) => {
  const library = await readLibrary();
  const video = (library.videos || []).find((item) => item.id === req.params.videoId);
  if (!video) {
    res.status(404).json({ ok: false, error: "Video not found." });
    return;
  }

  await deleteUploadedFile(video.src);
  const nextLibrary = { ...library, videos: (library.videos || []).filter((item) => item.id !== req.params.videoId) };
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
        videos: [],
        albums: [
          {
            id: cryptoRandomId(),
            title: legacyTrip.title || "Imported Trip",
            year: legacyTrip.year || "2026",
            intro: legacyTrip.intro || "",
            originalIntro: legacyTrip.originalIntro || legacyTrip.intro || "",
            photos: (legacyTrip.photos || []).map(normalizeMediaItem),
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
    videos: (library.videos || []).map(normalizeMediaItem).filter((item) => item.src),
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

async function processUploadedFiles(files) {
  const media = [];
  for (const file of files) {
    if (file.mimetype.startsWith("video/")) {
      const filename = await nextVideoFilename(file.originalname);
      const finalPath = path.join(uploadDir, filename);
      await fs.rename(file.path, finalPath);
      media.push({
        id: cryptoRandomId(),
        type: "video",
        src: `/uploads/${filename}`,
        caption: `Motion ${String(media.length + 1).padStart(2, "0")}`,
        orientation: "landscape"
      });
      continue;
    }

    const filename = await nextImageFilename();
    const finalPath = path.join(uploadDir, filename);
    const metadata = await optimizeImage(file.path, finalPath);
    await fs.unlink(file.path).catch(() => {});
    media.push({
      id: cryptoRandomId(),
      type: "image",
      src: `/uploads/${filename}`,
      caption: `Frame ${String(media.length + 1).padStart(2, "0")}`,
      width: metadata.width,
      height: metadata.height,
      orientation: metadata.height > metadata.width ? "portrait" : "landscape"
    });
  }
  return media;
}

async function nextImageFilename() {
  const day = formatFileDate(new Date());
  const files = await fs.readdir(uploadDir).catch(() => []);
  const prefix = `amy-travel-${day}-`;
  const next = nextNumber(files, prefix);
  return `${prefix}${String(next).padStart(2, "0")}.jpg`;
}

async function nextVideoFilename(originalName) {
  const day = formatFileDate(new Date());
  const files = await fs.readdir(uploadDir).catch(() => []);
  const prefix = `amy-motion-${day}-`;
  const next = nextNumber(files, prefix);
  return `${prefix}${String(next).padStart(2, "0")}${safeVideoExtension(originalName)}`;
}

function nextNumber(files, prefix) {
  const numbers = files
    .filter((name) => name.startsWith(prefix))
    .map((name) => Number(name.slice(prefix.length, prefix.length + 2)))
    .filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function safeVideoExtension(originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  if ([".mp4", ".mov", ".webm"].includes(ext)) return ext;
  return ".mp4";
}

async function optimizeImage(sourcePath, targetPath) {
  return sharp(sourcePath)
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
      max_tokens: 220,
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
    photos: (album.photos || []).map(normalizeMediaItem).filter((item) => item.src),
    createdAt: album.createdAt || new Date().toISOString(),
    updatedAt: album.updatedAt || album.createdAt || new Date().toISOString(),
    isSample: Boolean(album.isSample)
  };
}

function normalizeMediaItem(item, index = 0) {
  const type = item.type || (String(item.src || "").match(/\.(mp4|mov|webm)$/i) ? "video" : "image");
  return {
    id: item.id || cryptoRandomId(),
    type,
    src: item.src,
    caption: item.caption || (type === "video" ? `Motion ${String(index + 1).padStart(2, "0")}` : `Frame ${String(index + 1).padStart(2, "0")}`),
    width: item.width || null,
    height: item.height || null,
    orientation: item.orientation || "landscape",
    title: item.title || ""
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
