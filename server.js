import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const tmpDir = path.join(dataDir, "tmp");
const tripFile = path.join(dataDir, "trip.json");
const adminPassword = process.env.ADMIN_PASSWORD || "amy-travel";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const defaultTrip = {
  title: "Amy Travel",
  year: "2026",
  intro: "A visual notebook for places, light, rooms, meals, roads, and quiet family moments.",
  photos: [
    { src: "/assets/photo-01.svg", caption: "示例照片 01" },
    { src: "/assets/photo-02.svg", caption: "示例照片 02" },
    { src: "/assets/photo-03.svg", caption: "示例照片 03" },
    { src: "/assets/photo-04.svg", caption: "示例照片 04" },
    { src: "/assets/photo-05.svg", caption: "示例照片 05" },
    { src: "/assets/photo-06.svg", caption: "示例照片 06" }
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
  res.json(await readTrip());
});

app.post("/api/admin/trip", requireAdmin, upload.array("photos", 30), async (req, res) => {
  const existing = await readTrip();
  const rawTitle = clean(req.body.title) || existing.title || "Amy Travel";
  const rawYear = clean(req.body.year) || existing.year || new Date().getFullYear().toString();
  const rawIntro = clean(req.body.intro) || existing.intro || "";
  const polishedIntro = await polishIntro(rawTitle, rawIntro);
  const photos = [...(existing.photos || [])];

  for (const file of req.files || []) {
    const filename = await nextFilename(file.originalname);
    const finalPath = path.join(uploadDir, filename);
    await fs.rename(file.path, finalPath);
    photos.push({
      src: `/uploads/${filename}`,
      caption: cleanCaption(file.originalname)
    });
  }

  const trip = {
    title: rawTitle,
    year: rawYear,
    intro: polishedIntro,
    originalIntro: rawIntro,
    photos,
    updatedAt: new Date().toISOString()
  };

  await writeTrip(trip);
  res.json({ ok: true, trip });
});

app.post("/api/admin/clear-photos", requireAdmin, async (_req, res) => {
  const trip = await readTrip();
  trip.photos = [];
  await writeTrip(trip);
  res.json({ ok: true, trip });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function initStorage() {
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  if (!(await exists(tripFile))) {
    await writeTrip(defaultTrip);
  }
}

async function readTrip() {
  try {
    return { ...defaultTrip, ...JSON.parse(await fs.readFile(tripFile, "utf8")) };
  } catch (error) {
    if (error.code === "ENOENT") return defaultTrip;
    throw error;
  }
}

async function writeTrip(trip) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(tripFile, JSON.stringify(trip, null, 2), "utf8");
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

async function nextFilename(originalName) {
  const ext = safeExtension(originalName);
  const day = formatFileDate(new Date());
  const files = await fs.readdir(uploadDir).catch(() => []);
  const prefix = `amy-travel-${day}-`;
  const numbers = files
    .filter((name) => name.startsWith(prefix))
    .map((name) => Number(name.slice(prefix.length, prefix.length + 2)))
    .filter(Number.isFinite);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `${prefix}${String(next).padStart(2, "0")}${ext}`;
}

function safeExtension(originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return ".jpg";
}

async function polishIntro(title, intro) {
  if (!intro || !openai) return intro || "这次旅行的照片已经整理进 Amy Travel。";

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "你是一个高级旅行影像集编辑。请把用户朴素的中文旅行介绍润色成自然、克制、有画面感的中文，不要夸张，不要营销腔，不要超过90字。"
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

function cleanCaption(originalName) {
  return path.basename(originalName || "Photo", path.extname(originalName || "")).replace(/[-_]+/g, " ");
}

function formatFileDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
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
