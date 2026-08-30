"use strict";
(async () => {
  const BUILD = "20260830-final-png-v2";
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
  const readUint32BE = (bytes, offset) =>
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  const ensureImage = async (path) => {
    const response = await fetch(versioned(path), { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(`تعذر تحميل خلفية الاستمارة الرسمية (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const validSignature = bytes.length > 30000 && signature.every((value, index) => bytes[index] === value);
    const validDimensions = validSignature && readUint32BE(bytes, 16) === 1414 && readUint32BE(bytes, 20) === 2000;
    if (!validDimensions) throw new Error("ملف خلفية الاستمارة الرسمية غير صالح أو غير مكتمل.");
  };
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