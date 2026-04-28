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
  document.querySelector("#albumPhotos").innerHTML = (album.photos || []).map((photo, index) => `
    <figure class="${photo.orientation === "portrait" ? "portrait" : "landscape"}">
      ${photo.type === "video"
        ? `<video src="${photo.src}" muted loop playsinline controls preload="metadata"></video>`
        : `<img src="${photo.src}" alt="旅行照片 ${index + 1}" loading="lazy">`}
      <figcaption>Frame ${String(index + 1).padStart(2, "0")}</figcaption>
    </figure>
  `).join("");
}
