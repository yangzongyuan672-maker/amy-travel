const titleInput = document.querySelector("#tripTitle");
const yearInput = document.querySelector("#tripYearInput");
const introInput = document.querySelector("#tripIntro");
const photoInput = document.querySelector("#photoInput");
const saveButton = document.querySelector("#saveButton");
const clearButton = document.querySelector("#clearButton");
const statusText = document.querySelector("#status");

const settings = JSON.parse(localStorage.getItem("amyTravelSettings") || "{}");
titleInput.value = settings.title || "";
yearInput.value = settings.year || "";
introInput.value = settings.intro || "";

saveButton.addEventListener("click", async () => {
  const nextSettings = {
    title: titleInput.value.trim() || "Amy Travel",
    year: yearInput.value.trim() || new Date().getFullYear().toString(),
    intro: introInput.value.trim() || "这次旅行的照片已经整理进 Amy Travel。"
  };

  localStorage.setItem("amyTravelSettings", JSON.stringify(nextSettings));

  const files = Array.from(photoInput.files || []);
  if (!files.length) {
    statusText.textContent = "介绍已保存。没有选择新照片。";
    return;
  }

  statusText.textContent = "正在保存照片...";
  const existing = JSON.parse(localStorage.getItem("amyTravelPhotos") || "[]");
  const converted = [];

  for (const file of files) {
    const src = await fileToDataUrl(file);
    converted.push({
      src,
      caption: file.name.replace(/\.[^.]+$/, "")
    });
  }

  localStorage.setItem("amyTravelPhotos", JSON.stringify([...existing, ...converted]));
  photoInput.value = "";
  statusText.textContent = `已保存 ${converted.length} 张照片。现在可以返回 Amy Travel 查看。`;
});

clearButton.addEventListener("click", () => {
  const ok = confirm("确定清空当前浏览器里保存的旅行照片吗？旅行介绍会保留。");
  if (!ok) return;
  localStorage.removeItem("amyTravelPhotos");
  statusText.textContent = "本地照片已清空。";
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
