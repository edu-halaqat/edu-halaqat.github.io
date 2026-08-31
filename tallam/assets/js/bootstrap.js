"use strict";
(async () => {
  const BUILD = "20260831-admin-onedrive-v1";
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
  const loadImage = (source) => new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("تعذر قراءة خلفية استمارة الوزارة الرسمية."));
    image.src = source;
  });
  const canvasToPngBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== "image/png" || blob.size < 30000) {
        reject(new Error("تعذر تجهيز خلفية استمارة الوزارة بصيغة صالحة."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
  const prepareOfficialBackground = async () => {
    const webpSource = window.TallamOfficialMinistryBackground;
    if (!String(webpSource || "").startsWith("data:image/webp;base64,")) {
      throw new Error("خلفية استمارة الوزارة غير مكتملة.");
    }
    const image = await loadImage(webpSource);
    if (image.naturalWidth !== 1414 || image.naturalHeight !== 2000) {
      throw new Error("أبعاد خلفية استمارة الوزارة غير صحيحة.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1414;
    canvas.height = 2000;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("تعذر تجهيز خلفية استمارة الوزارة.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await canvasToPngBlob(canvas);
    const objectUrl = URL.createObjectURL(pngBlob);
    window.TallamOfficialMinistryBackground = objectUrl;
    window.addEventListener("pagehide", () => URL.revokeObjectURL(objectUrl), { once: true });
    delete window.__TallamMinistryBackgroundParts;
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
      read("assets/fragments/application-2.html")
    ]);
    appMount.outerHTML = part1 + part2;

    window.__TallamMinistryBackgroundParts = [];
    await Promise.all(Array.from({ length: 14 }, (_value, index) =>
      loadScript(`assets/js/ministry-bg-${String(index + 1).padStart(2, "0")}.js`)
    ));
    await loadScript("assets/js/ministry-background.js");
    await prepareOfficialBackground();

    await loadScript("assets/js/app-core.js");
    await loadScript("assets/js/ministry-export-final.js");
    await loadScript("assets/js/app-submit.js");
    await loadScript("assets/js/form-readiness.js");
  } catch (error) {
    showFatalError(error);
  }
})();
