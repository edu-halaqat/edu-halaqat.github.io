"use strict";
(async () => {
  const BUILD = "20260829-final-static-png-v1";
  const appMount = document.getElementById("appMount");
  const versioned = (path) => `${path}${path.includes("?") ? "&" : "?"}v=${BUILD}`;
  const read = async (path) => {
    const response = await fetch(versioned(path), { cache: "no-store" });
    if (!response.ok) throw new Error(`تعذر تحميل جزء من النموذج (${response.status}).`);
    return response.text();
  };
  const loadScript = (path) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = versioned(path);
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`تعذر تحميل ${path}`));
    document.body.appendChild(script);
  });
  const showFatalError = (error) => {
    console.error(error);
    const message = String(error?.message || "تعذر تحميل نموذج التسجيل.")
      .replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    const target = document.getElementById("teacherForm") || document.querySelector("main") || document.body;
    const box = document.createElement("div");
    box.className = "main-shell";
    box.innerHTML = `<div class="status show error">${message}</div>`;
    target.prepend(box);
  };

  try {
    const [part1, part2] = await Promise.all([
      read("assets/fragments/application-1.html"),
      read("assets/fragments/application-2.html")
    ]);
    appMount.outerHTML = part1 + part2;
    await loadScript("assets/js/app-core.js");
    window.TallamOfficialMinistryBackground = versioned("assets/img/ministry-form-background.png");
    await loadScript("assets/js/ministry-export-final.js");
    await loadScript("assets/js/app-submit.js");
    await loadScript("assets/js/form-readiness.js");
  } catch (error) {
    showFatalError(error);
  }
})();