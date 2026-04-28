const fallbackLibrary = {
  siteTitle: "Amy Travel",
  albums: [
    {
      id: "sample",
      title: "Amy Travel",
      year: "2026",
      intro: "A visual notebook for places, light, rooms, meals, roads, and quiet family moments.",
      photos: [
        { src: "/assets/photo-01.svg", caption: "Frame 01", orientation: "landscape" },
        { src: "/assets/photo-02.svg", caption: "Frame 02", orientation: "landscape" },
        { src: "/assets/photo-03.svg", caption: "Frame 03", orientation: "landscape" },
        { src: "/assets/photo-04.svg", caption: "Frame 04", orientation: "portrait" }
      ],
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ]
};

loadLibrary();

async function loadLibrary() {
  try {
    const response = await fetch("/api/albums");
    if (!response.ok) throw new Error("Failed to load albums");
    renderLibrary(await response.json());
  } catch (error) {
    console.error(error);
    renderLibrary(fallbackLibrary);
  }
}

function renderLibrary(library) {
  const albums = sortAlbums((library.albums || fallbackLibrary.albums).filter((album) => album.photos?.length));
  const latest = albums[0] || fallbackLibrary.albums[0];
  const latestPhoto = latest.photos?.[0]?.src || "/assets/photo-01.svg";
  renderMotionWall(library.videos || []);

  document.querySelector("#heroTitle").textContent = latest.title || "Amy Travel";
  document.querySelector("#heroSubtitle").textContent = latest.intro || fallbackLibrary.albums[0].intro;
  document.querySelector("#tripYear").textContent = latest.year || "2026";
  document.querySelector("#photoCount").textContent = `${String(latest.photos?.length || 0).padStart(2, "0")} photos`;
  document.querySelector("#coverPhoto").src = latestPhoto;
  document.querySelector("#latestLink").href = albumUrl(latest.id);

  document.querySelector("#albumCards").innerHTML = albums.map(renderAlbumCard).join("");
  document.querySelector("#archiveList").innerHTML = renderArchive(albums);
}

function renderAlbumCard(album, index) {
  const cover = album.photos?.[0]?.src || "/assets/photo-01.svg";
  return `
    <a class="album-card ${index === 0 ? "lead" : ""}" href="${albumUrl(album.id)}">
      <img src="${cover}" alt="${escapeHtml(album.title)}" loading="lazy">
      <div>
        <p>${escapeHtml(album.year || "Travel")}</p>
        <h3>${escapeHtml(album.title || "Untitled Trip")}</h3>
        <span>${album.photos?.length || 0} photographs</span>
      </div>
    </a>
  `;
}

function renderArchive(albums) {
  const grouped = albums.reduce((result, album) => {
    const year = album.year || "Unknown";
    result[year] = result[year] || [];
    result[year].push(album);
    return result;
  }, {});

  return Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map((year) => `
    <article>
      <span>${escapeHtml(year)}</span>
      <div>
        ${grouped[year].map((album) => `
          <a href="${albumUrl(album.id)}">
            <strong>${escapeHtml(album.title || "Untitled Trip")}</strong>
            <small>${album.photos?.length || 0} photographs</small>
          </a>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function renderMotionWall(videos) {
  const wall = document.querySelector("#motionWall");
  const grid = document.querySelector("#motionGrid");
  if (!videos.length) {
    wall.hidden = true;
    return;
  }

  wall.hidden = false;
  const selected = videos.slice(-12).reverse();
  grid.innerHTML = selected.map((video, index) => `
    <article class="motion-tile ${index === 0 ? "lead" : ""}">
      <video src="${video.src}" muted loop playsinline preload="metadata"></video>
      <span>${escapeHtml(video.title || `Motion ${String(index + 1).padStart(2, "0")}`)}</span>
    </article>
  `).join("");
  observeVideos(grid.querySelectorAll("video"));
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

function sortAlbums(albums) {
  return [...albums].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function albumUrl(id) {
  return `album.html?id=${encodeURIComponent(id)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
