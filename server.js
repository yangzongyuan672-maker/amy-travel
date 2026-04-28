import express from "express";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import multer from "multer";
import OpenAI from "openai";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ffprobePath = ffprobeStatic?.path || ffprobeStatic;

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
  const media = await processUploadedFiles(req.files || [], { location: rawTitle });

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
  const albumForLocation = (library.albums || []).find((album) => album.id === req.params.albumId);
  const media = await processUploadedFiles(req.files || [], { location: albumForLocation?.title || "" });
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
  const manualLocation = clean(req.body.location);
  const media = (await processUploadedFiles(req.files || [], { location: manualLocation })).filter((item) => item.type === "video");
  const existing = library.videos || [];
  const videos = [
    ...existing,
    ...media.map((item, index) => ({
      ...item,
      title: item.location || `Motion ${String(existing.length + index + 1).padStart(2, "0")}`,
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
    await deleteUploadedMedia(item);
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

  await deleteUploadedMedia(removed);
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

  await deleteUploadedMedia(video);
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

async function processUploadedFiles(files, options = {}) {
  const media = [];
  for (const file of files) {
    if (file.mimetype.startsWith("video/")) {
      const video = await optimizeVideo(file.path, options);
      await fs.unlink(file.path).catch(() => {});
      media.push({
        id: cryptoRandomId(),
        type: "video",
        src: `/uploads/${video.filename}`,
        poster: `/uploads/${video.posterFilename}`,
        caption: `Motion ${String(media.length + 1).padStart(2, "0")}`,
        width: video.width,
        height: video.height,
        duration: video.duration,
        capturedAt: video.capturedAt,
        location: video.location,
        coordinates: video.coordinates,
        orientation: video.orientation
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

async function nextVideoFilename() {
  const day = formatFileDate(new Date());
  const files = await fs.readdir(uploadDir).catch(() => []);
  const prefix = `amy-motion-${day}-`;
  const next = nextNumber(files, prefix);
  return `${prefix}${String(next).padStart(2, "0")}.mp4`;
}

function nextNumber(files, prefix) {
  const numbers = files
    .filter((name) => name.startsWith(prefix))
    .map((name) => Number(name.slice(prefix.length, prefix.length + 2)))
    .filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
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

async function optimizeVideo(sourcePath, options = {}) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg is not available. Please reinstall dependencies and deploy again.");
  }

  const metadata = await probeVideo(sourcePath);
  const dimensions = chooseVideoDimensions(metadata);
  const filename = await nextVideoFilename();
  const posterFilename = filename.replace(/\.mp4$/i, ".jpg");
  const videoPath = path.join(uploadDir, filename);
  const posterPath = path.join(uploadDir, posterFilename);

  await runFfmpeg([
    "-y",
    "-i", sourcePath,
    "-map", "0:v:0",
    "-vf", `scale=${dimensions.width}:${dimensions.height}`,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "24",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    videoPath
  ]);

  await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-frames:v", "1",
    "-q:v", "3",
    posterPath
  ]);

  return {
    filename,
    posterFilename,
    width: dimensions.width,
    height: dimensions.height,
    orientation: dimensions.orientation,
    duration: metadata.duration,
    capturedAt: metadata.capturedAt,
    location: clean(options.location) || metadata.location || "",
    coordinates: metadata.coordinates
  };
}

async function probeVideo(sourcePath) {
  if (!ffprobePath) return {};

  try {
    const output = await runFfprobe([
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      sourcePath
    ]);
    const data = JSON.parse(output);
    const stream = (data.streams || []).find((item) => item.codec_type === "video") || {};
    const tags = { ...(data.format?.tags || {}), ...(stream.tags || {}) };
    const rotation = readRotation(stream);
    const rawWidth = Number(stream.width) || 0;
    const rawHeight = Number(stream.height) || 0;
    const rotated = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;
    const width = rotated ? rawHeight : rawWidth;
    const height = rotated ? rawWidth : rawHeight;
    const coordinates = parseIso6709(tags["com.apple.quicktime.location.ISO6709"] || tags.location || "");

    return {
      width,
      height,
      rotation,
      duration: Number(stream.duration || data.format?.duration) || null,
      capturedAt: tags.creation_time || tags["com.apple.quicktime.creationdate"] || "",
      coordinates,
      location: coordinates ? formatCoordinates(coordinates) : ""
    };
  } catch (error) {
    console.warn("Video metadata probe failed:", error.message);
    return {};
  }
}

function chooseVideoDimensions(metadata) {
  const width = Number(metadata.width) || 1080;
  const height = Number(metadata.height) || 1080;
  const orientation = width > height * 1.12 ? "landscape" : height > width * 1.12 ? "portrait" : "square";
  const maxLongEdge = orientation === "landscape" ? 1440 : 1600;
  const longEdge = Math.max(width, height);
  const scale = Math.min(1, maxLongEdge / longEdge);
  return {
    width: even(Math.max(2, Math.round(width * scale))),
    height: even(Math.max(2, Math.round(height * scale))),
    orientation
  };
}

function even(value) {
  return value % 2 === 0 ? value : value - 1;
}

function readRotation(stream) {
  const sideData = (stream.side_data_list || []).find((item) => item.rotation !== undefined);
  const rotateTag = stream.tags?.rotate;
  return Number(sideData?.rotation ?? rotateTag ?? 0) || 0;
}

function parseIso6709(value) {
  const match = String(value || "").match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function formatCoordinates(coordinates) {
  if (!coordinates) return "";
  const lat = Math.abs(coordinates.latitude).toFixed(2);
  const lon = Math.abs(coordinates.longitude).toFixed(2);
  return `${lat}${coordinates.latitude >= 0 ? "N" : "S"} / ${lon}${coordinates.longitude >= 0 ? "E" : "W"}`;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed with code ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`ffprobe failed with code ${code}: ${stderr.slice(-1200)}`));
    });
  });
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
    poster: item.poster || "",
    caption: item.caption || (type === "video" ? `Motion ${String(index + 1).padStart(2, "0")}` : `Frame ${String(index + 1).padStart(2, "0")}`),
    width: item.width || null,
    height: item.height || null,
    duration: item.duration || null,
    capturedAt: item.capturedAt || "",
    location: item.location || "",
    coordinates: item.coordinates || null,
    orientation: item.orientation || inferOrientation(item.width, item.height, type),
    title: item.title || ""
  };
}

function inferOrientation(width, height, type) {
  if (type === "video" && height > width) return "portrait";
  if (width > height) return "landscape";
  return type === "video" ? "square" : "landscape";
}

function latestAlbum(library) {
  return [...(library.albums || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || defaultLibrary.albums[0];
}

async function deleteUploadedMedia(item) {
  await deleteUploadedFile(item?.src);
  await deleteUploadedFile(item?.poster);
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
