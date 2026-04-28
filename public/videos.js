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
    return `
      <article class="motion-tile">
        <video src="${video.src}" ${poster} muted loop playsinline preload="metadata"></video>
        <span>${escapeHtml(video.title || `Motion ${String(index + 1).padStart(2, "0")}`)}</span>
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
