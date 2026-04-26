const passwordInput = document.querySelector("#password");
const titleInput = document.querySelector("#tripTitle");
const yearInput = document.querySelector("#tripYearInput");
const introInput = document.querySelector("#tripIntro");
const photoInput = document.querySelector("#photoInput");
const saveButton = document.querySelector("#saveButton");
const statusText = document.querySelector("#status");
const albumList = document.querySelector("#albumList");

passwordInput.value = localStorage.getItem("amyTravelPassword") || "";
yearInput.value = new Date().getFullYear().toString();

loadLibrary();

saveButton.addEventListener("click", async () => {
  const password = passwordInput.value.trim();
  if (!password) {
    setStatus("请先输入管理密码。", true);
    return;
  }

  localStorage.setItem("amyTravelPassword", password);
  const formData = new FormData();
  formData.append("title", titleInput.value.trim() || "Untitled Trip");
  formData.append("year", yearInput.value.trim() || new Date().getFullYear().toString());
  formData.append("intro", introInput.value.trim());
  Array.from(photoInput.files || []).forEach((file) => formData.append("photos", file));

  saveButton.disabled = true;
  setStatus("正在创建新专辑。照片会自动压缩，介绍会自动润色...");

  try {
    const response = await fetch("/api/admin/trip", {
      method: "POST",
      headers: {
        "x-admin-password": password
      },
      body: formData
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "保存失败");

    titleInput.value = "";
    introInput.value = "";
    photoInput.value = "";
    yearInput.value = new Date().getFullYear().toString();
    renderLibrary(result.library);
    setStatus("新专辑已保存。可以返回 Amy Travel 查看。");
  } catch (error) {
    setStatus(error.message || "保存失败，请稍后再试。", true);
  } finally {
    saveButton.disabled = false;
  }
});

albumList.addEventListener("click", async (event) => {
  const deleteAlbum = event.target.closest("[data-delete-album]");
  const deletePhoto = event.target.closest("[data-delete-photo]");
  if (!deleteAlbum && !deletePhoto) return;

  const password = passwordInput.value.trim();
  if (!password) {
    setStatus("请先输入管理密码。", true);
    return;
  }

  const isAlbum = Boolean(deleteAlbum);
  const id = isAlbum ? deleteAlbum.dataset.deleteAlbum : deletePhoto.dataset.deletePhoto;
  const ok = confirm(isAlbum ? "确定删除整个专辑吗？" : "确定删除这张照片吗？");
  if (!ok) return;

  try {
    const response = await fetch(isAlbum ? `/api/admin/albums/${id}` : `/api/admin/photos/${id}`, {
      method: "DELETE",
      headers: {
        "x-admin-password": password
      }
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "删除失败");
    renderLibrary(result.library);
    setStatus(isAlbum ? "专辑已删除。" : "照片已删除。");
  } catch (error) {
    setStatus(error.message || "删除失败。", true);
  }
});

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
  const albums = [...(library.albums || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  albumList.innerHTML = albums.map((album) => `
    <article class="manage-album">
      <div class="manage-album-head">
        <div>
          <p>${escapeHtml(album.year || "")}</p>
          <h2>${escapeHtml(album.title || "Untitled Trip")}</h2>
          <span>${album.photos?.length || 0} photographs</span>
        </div>
        ${album.isSample ? "" : `<button type="button" data-delete-album="${escapeHtml(album.id)}">删除专辑</button>`}
      </div>
      <div class="manage-photos">
        ${(album.photos || []).map((photo, index) => `
          <figure>
            <img src="${photo.src}" alt="照片 ${index + 1}">
            ${album.isSample ? "" : `<button type="button" data-delete-photo="${escapeHtml(photo.id)}">删除</button>`}
          </figure>
        `).join("")}
      </div>
    </article>
  `).join("");
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
