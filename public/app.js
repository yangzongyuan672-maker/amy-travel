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
        { src: "/assets/photo-04.svg", caption: "Frame 04", orientation: "portrait" },
        { src: "/assets/photo-05.svg", caption: "Frame 05", orientation: "landscape" },
        { src: "/assets/photo-06.svg", caption: "Frame 06", orientation: "landscape" }
      ]
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
  const albums = [...(library.albums || fallbackLibrary.albums)]
    .filter((album) => album.photos?.length)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const leadAlbum = albums[0] || fallbackLibrary.albums[0];
  const leadPhotos = leadAlbum.photos?.length ? leadAlbum.photos : fallbackLibrary.albums[0].photos;

  document.querySelector("#heroTitle").textContent = leadAlbum.title || "Amy Travel";
  document.querySelector("#heroSubtitle").textContent = leadAlbum.intro || fallbackLibrary.albums[0].intro;
  document.querySelector("#tripYear").textContent = leadAlbum.year || "2026";
  document.querySelector("#photoCount").textContent = `${String(totalPhotoCount(albums)).padStart(2, "0")} photos`;
  document.querySelector("#coverPhoto").src = leadPhotos[0]?.src || "/assets/photo-01.svg";

  document.querySelector("#albumGrid").innerHTML = albums.map((album, albumIndex) => renderAlbum(album, albumIndex)).join("");
}

function renderAlbum(album, albumIndex) {
  const photos = album.photos || [];
  return `
    <article class="album" id="album-${escapeHtml(album.id)}">
      <div class="album-copy">
        <p class="kicker">${escapeHtml(album.year || "Travel")}</p>
        <h2>${escapeHtml(album.title || "Untitled Trip")}</h2>
        <p>${escapeHtml(album.intro || "")}</p>
        <span>${photos.length} photographs</span>
      </div>
      <div class="photo-grid ${albumIndex % 2 ? "alternate" : ""}">
        ${photos.map((photo, index) => renderPhoto(photo, index)).join("")}
      </div>
    </article>
  `;
}

function renderPhoto(photo, index) {
  const orientation = photo.orientation === "portrait" ? "portrait" : "landscape";
  return `
    <figure class="${orientation}">
      <img src="${photo.src}" alt="旅行照片 ${index + 1}" loading="lazy">
      <figcaption>Frame ${String(index + 1).padStart(2, "0")}</figcaption>
    </figure>
  `;
}

function totalPhotoCount(albums) {
  return albums.reduce((sum, album) => sum + (album.photos?.length || 0), 0);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
