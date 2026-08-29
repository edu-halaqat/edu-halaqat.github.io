"use strict";
(async () => {
  const BUILD = "20260829-final-png-v1";
  const appMount = document.getElementById("appMount");
  window.__TALLAM_BUILD__ = BUILD;

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
  const ensureImage = async (path) => {
    const response = await fetch(versioned(path), { cache: "no-store" });
    if (!response.ok) throw new Error(`تعذر تحميل خلفية الاستمارة الرسمية (${response.status}).`);
    const blob = await response.blob();
    if (blob.type !== "image/png" || blob.size < 100000) {
      throw new Error("ملف خلفية الاستمارة الرسمية غير صالح.");
    }
  };
  const showFatalError = (error) => {
    console.error(error);
    const message = String(error?.message || "تعذر تحميل نموذج التسجيل.")
      .replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const target = document.getElementById("teacherForm") || document.querySelector("main") || document.body;
    const box = document.createElement("div");
    box.className = "main-shell";
    box.innerHTML = `<div class="status show error">${message}</div>`;
    target.prepend(box);
  };

  try {
    const [part1, part2] = await Promise.all([
      read("assets/fragments/application-1.html"),
      read("assets/fragments/application-2.html"),
      ensureImage("assets/img/ministry-form-background.png")
    ]);
    appMount.outerHTML = part1 + part2;

    window.TallamOfficialMinistryBackground = versioned("assets/img/ministry-form-background.png");
    await loadScript("assets/js/app-core.js");
    await loadScript("assets/js/ministry-export-final.js");
    await loadScript("assets/js/app-submit.js");
    await loadScript("assets/js/form-readiness.js");
  } catch (error) {
    showFatalError(error);
  }
})();