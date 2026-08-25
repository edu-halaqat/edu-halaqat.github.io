"use strict";
(async () => {
  const appMount = document.getElementById("appMount");
  const exportMount = document.getElementById("exportMount");
  const read = async (url) => {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`تعذر تحميل جزء من النموذج (${response.status}).`);
    return response.text();
  };
  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`تعذر تحميل ${src}`));
    document.body.appendChild(script);
  });
  try {
    const [part1, part2, ministry] = await Promise.all([
      read("assets/fragments/application-1.html"),
      read("assets/fragments/application-2.html"),
      read("assets/fragments/ministry-sheet.html")
    ]);
    appMount.outerHTML = part1 + part2;
    exportMount.outerHTML = ministry;
    await loadScript("assets/js/app-core.js");
    await loadScript("assets/js/app-submit.js");
  } catch (error) {
    console.error(error);
    appMount.innerHTML = `<div class="main-shell"><div class="status show error">${String(error?.message || "تعذر تحميل نموذج التسجيل.")}</div></div>`;
  }
})();
