loadVideos();

async function loadVideos() {
  try {
    const response = await fetch("/api/albums");
    if (!response.ok) throw new Error("Failed to load videos");
    const library = await response.json();
    renderVideos(document.querySelector("#allVideos"), library.videos || []);
  } catch (error) {
    console.error(error);
  }
}

function renderVideos(target, videos) {
  target.innerHTML = videos.map((video, index) => {
    const poster = video.poster ? `poster="${escapeHtml(video.poster)}"` : "";
    const posterImage = video.poster ? `<img class="motion-poster" src="${escapeHtml(video.poster)}" alt="${escapeHtml(video.title || "旅行影像")}" loading="eager">` : "";
    const orientation = video.orientation || inferOrientation(video);
    const width = Number(video.width) || (orientation === "portrait" ? 9 : 16);
    const height = Number(video.height) || (orientation === "portrait" ? 16 : 9);
    const title = video.aiTitle || video.caption || `Motion ${String(index + 1).padStart(2, "0")}`;
    const location = video.location || video.title || "Amy Travel";
    const note = video.aiNote || [formatVideoDate(video.capturedAt), formatDuration(video.duration)].filter(Boolean).join(" · ");
    return `
      <article class="motion-tile ${orientation === "portrait" ? "portrait-card" : "landscape-card"}" data-orientation="${escapeHtml(orientation)}" style="--media-ratio: ${width} / ${height};">
        ${posterImage}
        <video src="${video.src}" ${poster} muted loop playsinline preload="metadata"></video>
        <div class="motion-shade" aria-hidden="true"></div>
        <div class="motion-copy">
          <p>${escapeHtml(location)}</p>
          <h3>${escapeHtml(title)}</h3>
          <span>${escapeHtml(note)}</span>
        </div>
      </article>
    `;
  }).join("");
  observeVideos(target.querySelectorAll("video"));
}

function observeVideos(videos) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) {
        if (video.preload !== "auto") {
          video.preload = "auto";
          video.load();
        }
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, {
    rootMargin: "360px 0px",
    threshold: 0.12
  });
  videos.forEach((video) => observer.observe(video));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inferOrientation(video) {
  const width = Number(video.width) || 1;
  const height = Number(video.height) || 1;
  if (width > height * 1.12) return "landscape";
  if (height > width * 1.12) return "portrait";
  return "square";
}

function formatVideoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/-/g, ".");
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return `${Math.max(1, Math.round(seconds))} sec loop`;
}
