const passwordInput = document.querySelector("#password");
const titleInput = document.querySelector("#tripTitle");
const yearInput = document.querySelector("#tripYearInput");
const introInput = document.querySelector("#tripIntro");
const photoInput = document.querySelector("#photoInput");
const saveButton = document.querySelector("#saveButton");
const clearButton = document.querySelector("#clearButton");
const statusText = document.querySelector("#status");

passwordInput.value = localStorage.getItem("amyTravelPassword") || "";

loadTrip();

saveButton.addEventListener("click", async () => {
  const password = passwordInput.value.trim();
  if (!password) {
    setStatus("请先输入管理密码。", true);
    return;
  }

  localStorage.setItem("amyTravelPassword", password);
  const formData = new FormData();
  formData.append("title", titleInput.value.trim() || "Amy Travel");
  formData.append("year", yearInput.value.trim() || new Date().getFullYear().toString());
  formData.append("intro", introInput.value.trim());
  Array.from(photoInput.files || []).forEach((file) => formData.append("photos", file));

  saveButton.disabled = true;
  setStatus("正在保存。若配置了 OpenAI API，会同时润色介绍...");

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

    photoInput.value = "";
    renderForm(result.trip);
    setStatus("已保存。可以返回 Amy Travel 查看更新后的页面。");
  } catch (error) {
    setStatus(error.message || "保存失败，请稍后再试。", true);
  } finally {
    saveButton.disabled = false;
  }
});

clearButton.addEventListener("click", async () => {
  const password = passwordInput.value.trim();
  if (!password) {
    setStatus("请先输入管理密码。", true);
    return;
  }

  const ok = confirm("确定清空当前旅行照片吗？标题和介绍会保留。");
  if (!ok) return;

  try {
    const response = await fetch("/api/admin/clear-photos", {
      method: "POST",
      headers: {
        "x-admin-password": password
      }
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "清空失败");
    renderForm(result.trip);
    setStatus("照片已清空。");
  } catch (error) {
    setStatus(error.message || "清空失败。", true);
  }
});

async function loadTrip() {
  try {
    const response = await fetch("/api/trip");
    if (!response.ok) return;
    renderForm(await response.json());
  } catch {
    setStatus("当前是本地静态预览，部署到 Railway 后可以保存。", true);
  }
}

function renderForm(trip) {
  titleInput.value = trip.title || "";
  yearInput.value = trip.year || "";
  introInput.value = trip.originalIntro || trip.intro || "";
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}
