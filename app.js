const defaultPhotos = [
  "assets/photo-01.svg",
  "assets/photo-02.svg",
  "assets/photo-03.svg",
  "assets/photo-04.svg",
  "assets/photo-05.svg",
  "assets/photo-06.svg"
];

const settings = JSON.parse(localStorage.getItem("amyTravelSettings") || "{}");
const storedPhotos = JSON.parse(localStorage.getItem("amyTravelPhotos") || "[]");

document.querySelector("#heroTitle").textContent = settings.title || "Amy Travel";
document.querySelector("#heroSubtitle").textContent = settings.intro || "A quiet family travel album for photos, places, and the feeling of a trip.";
document.querySelector("#storyTitle").textContent = settings.title || "本次旅行";
document.querySelector("#storyText").textContent = settings.intro || "这里会显示你在上传入口里写的旅行介绍。成品以后不需要路线记录，只保留本次旅行的介绍和照片。";
document.querySelector("#tripYear").textContent = settings.year || "2026";

const photos = storedPhotos.length ? storedPhotos : defaultPhotos.map((src) => ({ src, caption: "示例照片" }));
document.querySelector("#photoCount").textContent = String(photos.length).padStart(2, "0");

document.querySelector("#photoGrid").innerHTML = photos.map((photo, index) => `
  <figure>
    <img src="${photo.src}" alt="旅行照片 ${index + 1}">
    <figcaption>${photo.caption || `Photo ${String(index + 1).padStart(2, "0")}`}</figcaption>
  </figure>
`).join("");
