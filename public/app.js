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
  const selected = videos.slice(-9).reverse();
  grid.innerHTML = selected.map(renderMotionTile).join("");
  prepareMotionVideos(grid.querySelectorAll("video"));
}

function renderMotionTile(video, index) {
  const shouldPrime = index < 4;
  const poster = video.poster ? `poster="${escapeHtml(video.poster)}"` : "";
  const orientation = video.orientation || inferOrientation(video);
  const layout = motionLayoutClass(index, orientation);
  const location = video.location || video.title || "Amy Travel";
  const date = formatVideoDate(video.capturedAt);
  const duration = formatDuration(video.duration);
  const label = video.aiTitle || video.caption || `Motion ${String(index + 1).padStart(2, "0")}`;
  const note = video.aiNote || [date, duration].filter(Boolean).join(" · ");

  return `
    <article class="motion-tile ${layout}" data-orientation="${escapeHtml(orientation)}">
      <video
        src="${video.src}"
        ${poster}
        muted
        loop
        autoplay
        playsinline
        preload="${shouldPrime ? "auto" : "metadata"}"
        data-priority="${shouldPrime ? "high" : "normal"}"
      ></video>
      <div class="motion-shade" aria-hidden="true"></div>
      <div class="motion-copy">
        <p>${escapeHtml(location)}</p>
        <h3>${escapeHtml(index === 0 ? "A Moving Archive" : label)}</h3>
        <span>${escapeHtml(note)}</span>
      </div>
      <small>${escapeHtml(String(index + 1).padStart(2, "0"))}</small>
    </article>
  `;
}

function motionLayoutClass(index, orientation) {
  if (index === 0) return "lead";
  if (index === 1) return "rail";
  if (index === 2) return orientation === "landscape" ? "wide" : "portrait";
  if (index === 3) return "square";
  if (index === 4) return "strip";
  if (orientation === "landscape") return "wide";
  if (orientation === "portrait") return "portrait";
  return "square";
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

function prepareMotionVideos(videos) {
  videos.forEach((video, index) => {
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = false;

    if (index < 4) {
      video.preload = "auto";
    }

    video.load();
    attemptVideoPlay(video);
    video.addEventListener("loadeddata", () => attemptVideoPlay(video), { once: true });
    video.addEventListener("canplay", () => attemptVideoPlay(video), { once: true });
  });

  observeVideos(videos);
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
        attemptVideoPlay(video);
      } else {
        video.pause();
      }
    });
  }, {
    rootMargin: "520px 0px",
    threshold: 0.1
  });

  videos.forEach((video) => observer.observe(video));
}

function attemptVideoPlay(video) {
  const play = () => video.play().catch(() => {});

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    play();
    return;
  }

  video.addEventListener("loadeddata", play, { once: true });
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
