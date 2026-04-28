const passwordInput = document.querySelector("#password");
const uploadMode = document.querySelector("#uploadMode");
const albumSelect = document.querySelector("#albumSelect");
const albumSelectWrap = document.querySelector("#albumSelectWrap");
const titleInput = document.querySelector("#tripTitle");
const yearInput = document.querySelector("#tripYearInput");
const introInput = document.querySelector("#tripIntro");
const locationInput = document.querySelector("#motionLocation");
const mediaInput = document.querySelector("#mediaInput");
const saveButton = document.querySelector("#saveButton");
const statusText = document.querySelector("#status");
const albumList = document.querySelector("#albumList");
const videoList = document.querySelector("#videoList");

let currentLibrary = { albums: [], videos: [] };

passwordInput.value = localStorage.getItem("amyTravelPassword") || "";
yearInput.value = new Date().getFullYear().toString();

uploadMode.addEventListener("change", updateMode);
loadLibrary();

saveButton.addEventListener("click", async () => {
  const password = passwordInput.value.trim();
  if (!password) return setStatus("请先输入管理密码。", true);

  localStorage.setItem("amyTravelPassword", password);
  saveButton.disabled = true;

  try {
    const mode = uploadMode.value;
    const formData = new FormData();
    Array.from(mediaInput.files || []).forEach((file) => formData.append("media", file));

    let url = "/api/admin/trip";
    if (mode === "new") {
      formData.append("title", titleInput.value.trim() || "Untitled Trip");
      formData.append("year", yearInput.value.trim() || new Date().getFullYear().toString());
      formData.append("intro", introInput.value.trim());
      setStatus("正在创建新专辑...");
    } else if (mode === "append") {
      if (!albumSelect.value) throw new Error("请先选择要追加的专辑。");
      url = `/api/admin/albums/${albumSelect.value}/media`;
      setStatus("正在追加到已有专辑...");
    } else {
      url = "/api/admin/videos";
      formData.append("location", locationInput.value.trim());
      setStatus("正在压缩视频并生成杂志墙信息...");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "x-admin-password": password },
      body: formData
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "保存失败");

    titleInput.value = "";
    introInput.value = "";
    locationInput.value = "";
    mediaInput.value = "";
    yearInput.value = new Date().getFullYear().toString();
    renderLibrary(result.library);
    setStatus("已保存。可以返回 Amy Travel 查看。");
  } catch (error) {
    setStatus(error.message || "保存失败，请稍后再试。", true);
  } finally {
    saveButton.disabled = false;
  }
});

albumList.addEventListener("click", handleDeleteClick);
videoList.addEventListener("click", handleDeleteClick);

async function handleDeleteClick(event) {
  const deleteAlbum = event.target.closest("[data-delete-album]");
  const deletePhoto = event.target.closest("[data-delete-photo]");
  const deleteVideo = event.target.closest("[data-delete-video]");
  if (!deleteAlbum && !deletePhoto && !deleteVideo) return;

  const password = passwordInput.value.trim();
  if (!password) return setStatus("请先输入管理密码。", true);

  const target = deleteAlbum || deletePhoto || deleteVideo;
  const endpoint = deleteAlbum
    ? `/api/admin/albums/${target.dataset.deleteAlbum}`
    : deletePhoto
      ? `/api/admin/photos/${target.dataset.deletePhoto}`
      : `/api/admin/videos/${target.dataset.deleteVideo}`;
  const ok = confirm(deleteAlbum ? "确定删除整个专辑吗？" : "确定删除这个项目吗？");
  if (!ok) return;

  try {
    const response = await fetch(endpoint, { method: "DELETE", headers: { "x-admin-password": password } });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "删除失败");
    renderLibrary(result.library);
    setStatus("已删除。");
  } catch (error) {
    setStatus(error.message || "删除失败。", true);
  }
}

async function loadLibrary() {
  try {
    const response = await fetch("/api/albums");
    if (!response.ok) return;
    renderLibrary(await response.json());
  } catch {
    setStatus("当前无法读取专辑列表，请检查部署状态。", true);
  }
}

function renderLibrary(library) {
  currentLibrary = library;
  const albums = [...(library.albums || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  albumSelect.innerHTML = albums.filter((album) => !album.isSample).map((album) => `
    <option value="${escapeHtml(album.id)}">${escapeHtml(album.title || "Untitled Trip")}</option>
  `).join("");

  albumList.innerHTML = albums.map((album) => `
    <article class="manage-album">
      <div class="manage-album-head">
        <div>
          <p>${escapeHtml(album.year || "")}</p>
          <h2>${escapeHtml(album.title || "Untitled Trip")}</h2>
          <span>${album.photos?.length || 0} items</span>
        </div>
        ${album.isSample ? "" : `<button type="button" data-delete-album="${escapeHtml(album.id)}">删除专辑</button>`}
      </div>
      <div class="manage-photos">
        ${(album.photos || []).map((item, index) => `
          <figure>
            ${item.type === "video" ? `<video src="${item.src}" poster="${escapeHtml(item.poster || "")}" muted playsinline></video>` : `<img src="${item.src}" alt="照片 ${index + 1}">`}
            ${album.isSample ? "" : `<button type="button" data-delete-photo="${escapeHtml(item.id)}">删除</button>`}
          </figure>
        `).join("")}
      </div>
    </article>
  `).join("");

  videoList.innerHTML = (library.videos || []).slice().reverse().map((video) => `
    <article class="manage-video">
      <video src="${video.src}" poster="${escapeHtml(video.poster || "")}" muted loop playsinline controls preload="metadata"></video>
      <p>${escapeHtml(video.location || video.title || "Motion")}</p>
      <button type="button" data-delete-video="${escapeHtml(video.id)}">删除</button>
    </article>
  `).join("");

  updateMode();
}

function updateMode() {
  const mode = uploadMode.value;
  albumSelectWrap.hidden = mode !== "append";
  document.querySelectorAll(".new-only").forEach((element) => {
    element.hidden = mode !== "new";
  });
  document.querySelectorAll(".motion-only").forEach((element) => {
    element.hidden = mode !== "motion";
  });
  mediaInput.accept = mode === "motion"
    ? "video/mp4,video/quicktime,video/webm"
    : "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
