loadAlbum();

async function loadAlbum() {
  const id = new URLSearchParams(window.location.search).get("id");
  try {
    const response = await fetch("/api/albums");
    if (!response.ok) throw new Error("Failed to load albums");
    const library = await response.json();
    const albums = [...(library.albums || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const album = albums.find((item) => item.id === id) || albums[0];
    renderAlbum(album);
  } catch (error) {
    console.error(error);
    document.querySelector("#albumTitle").textContent = "Album unavailable";
  }
}

function renderAlbum(album) {
  if (!album) return;
  document.title = `Amy Travel | ${album.title}`;
  document.querySelector("#albumYear").textContent = album.year || "Travel Book";
  document.querySelector("#albumTitle").textContent = album.title || "Untitled Trip";
  document.querySelector("#albumIntro").textContent = album.intro || "";
  document.querySelector("#albumPhotos").innerHTML = (album.photos || []).map((photo, index) => renderMediaItem(photo, index, album)).join("");
  prepareAlbumVideos(document.querySelectorAll("#albumPhotos video"));
}

function renderMediaItem(photo, index, album) {
  const orientation = photo.orientation === "portrait" ? "portrait" : photo.orientation === "square" ? "square" : "landscape";
  if (photo.type === "video") {
    const poster = photo.poster ? `poster="${escapeHtml(photo.poster)}"` : "";
    const location = photo.location || album.title || "Amy Travel";
    const date = formatVideoDate(photo.capturedAt) || album.year || "";
    const duration = formatDuration(photo.duration);
    const label = photo.aiTitle || photo.title || photo.caption || `Motion ${String(index + 1).padStart(2, "0")}`;
    const note = photo.aiNote || [date, duration].filter(Boolean).join(" · ");

    return `
      <figure class="album-media album-video ${orientation}">
        <video src="${photo.src}" ${poster} muted loop autoplay playsinline preload="auto"></video>
        <div class="album-video-shade" aria-hidden="true"></div>
        <figcaption class="album-video-caption">
          <span>${escapeHtml(location)}</span>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(note)}</small>
        </figcaption>
      </figure>
    `;
  }

  return `
    <figure class="album-media ${orientation}">
      <img src="${photo.src}" alt="旅行照片 ${index + 1}" loading="lazy">
      <figcaption>Frame ${String(index + 1).padStart(2, "0")}</figcaption>
    </figure>
  `;
}

function prepareAlbumVideos(videos) {
  videos.forEach((video) => {
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = false;
    video.preload = "auto";
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, {
    rootMargin: "420px 0px",
    threshold: 0.08
  });

  videos.forEach((video) => {
    video.load();
    video.play().catch(() => {});
    video.addEventListener("loadeddata", () => video.play().catch(() => {}), { once: true });
    observer.observe(video);
  });
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
