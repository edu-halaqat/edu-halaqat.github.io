"use strict";
(async () => {
  const BUILD = "20260827-0745";
  const appMount = document.getElementById("appMount");

  const read = async (url) => {
    const response = await fetch(`${url}?v=${BUILD}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`تعذر تحميل جزء من النموذج (${response.status}).`);
    return response.text();
  };

  const loadScript = (path) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${path}?v=${BUILD}`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`تعذر تحميل ${path}`));
    document.body.appendChild(script);
  });

  const showFatalError = (error) => {
    console.error(error);
    const message = String(error?.message || "تعذر تحميل نموذج التسجيل.");
    const target = document.getElementById("application-form") || document.querySelector("main") || document.body;
    const box = document.createElement("div");
    box.className = "main-shell";
    box.innerHTML = `<div class="status show error">${message.replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))}</div>`;
    target.prepend(box);
  };

  try {
    const [part1, part2] = await Promise.all([
      read("assets/fragments/application-1.html"),
      read("assets/fragments/application-2.html")
    ]);
    appMount.outerHTML = part1 + part2;

    await loadScript("assets/js/app-core.js");
    const backgroundParts = Array.from({ length: 14 }, (_, index) =>
      loadScript(`assets/js/ministry-bg-${String(index + 1).padStart(2, "0")}.js`)
    );
    await Promise.all(backgroundParts);
    await loadScript("assets/js/ministry-background.js");
    await loadScript("assets/js/ministry-export.js");
    await loadScript("assets/js/app-submit.js");
    await loadScript("assets/js/form-readiness.js");
  } catch (error) {
    showFatalError(error);
  }
})();
