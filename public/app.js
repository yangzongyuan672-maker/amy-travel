const fallbackTrip = {
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

loadTrip();

async function loadTrip() {
  try {
    const response = await fetch("/api/trip");
    if (!response.ok) throw new Error("Failed to load trip");
    renderTrip(await response.json());
  } catch (error) {
    console.error(error);
    renderTrip(fallbackTrip);
  }
}

function renderTrip(trip) {
  const photos = trip.photos?.length ? trip.photos : fallbackTrip.photos;
  document.querySelector("#heroTitle").textContent = trip.title || "Amy Travel";
  document.querySelector("#heroSubtitle").textContent = trip.intro || fallbackTrip.intro;
  document.querySelector("#storyTitle").textContent = trip.title || "本次旅行";
  document.querySelector("#storyText").textContent = trip.intro || "写一小段本次旅行介绍，剩下交给照片。这里不需要路线，不需要流水账。";
  document.querySelector("#tripYear").textContent = trip.year || "2026";
  document.querySelector("#photoCount").textContent = `${String(photos.length).padStart(2, "0")} photos`;
  document.querySelector("#coverPhoto").src = photos[0]?.src || "/assets/photo-01.svg";

  document.querySelector("#photoGrid").innerHTML = photos.map((photo, index) => `
    <figure>
      <img src="${photo.src}" alt="旅行照片 ${index + 1}" loading="lazy">
      <figcaption>${escapeHtml(photo.caption || `Photo ${String(index + 1).padStart(2, "0")}`)}</figcaption>
    </figure>
  `).join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
