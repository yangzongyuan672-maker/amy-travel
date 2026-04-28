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
  target.innerHTML = videos.map((video, index) => `
    <article class="motion-tile">
      <video src="${video.src}" muted loop playsinline preload="metadata"></video>
      <span>${video.title || `Motion ${String(index + 1).padStart(2, "0")}`}</span>
    </article>
  `).join("");
  observeVideos(target.querySelectorAll("video"));
}

function observeVideos(videos) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.45 });
  videos.forEach((video) => observer.observe(video));
}
