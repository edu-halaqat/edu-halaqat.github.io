"use strict";
(async () => {
  const appMount = document.getElementById("appMount");
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
    const [part1, part2] = await Promise.all([
      read("assets/fragments/application-1.html"),
      read("assets/fragments/application-2.html")
    ]);
    appMount.outerHTML = part1 + part2;
    await loadScript("assets/js/app-core.js?v=20260826-0035");
    await loadScript("assets/js/ministry-background.js?v=20260826-0035");
    await loadScript("assets/js/ministry-export.js?v=20260826-0035");
    await loadScript("assets/js/app-submit.js?v=20260826-0035");
  } catch (error) {
    console.error(error);
    appMount.innerHTML = `<div class="main-shell"><div class="status show error">${String(error?.message || "تعذر تحميل نموذج التسجيل.")}</div></div>`;
  }
})();
