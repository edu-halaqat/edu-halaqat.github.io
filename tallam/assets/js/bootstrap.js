"use strict";
(async () => {
  const CACHE_COMPAT_BUILD = "20260831-mobile-provider-v4";
  const RELEASE = "20260902-manual-ministry-form-v1";
  const appMount = document.getElementById("appMount");
  window.__TALLAM_BUILD__ = RELEASE;
  document.body.dataset.portalReady = "loading";
  document.body.dataset.fileCacheReady = "loading";
  document.body.dataset.fileReadinessBridge = "loading";

  const versioned = (path) => `${path}${path.includes("?") ? "&" : "?"}v=${RELEASE}`;
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
    const rawMessage = String(error?.message || "تعذر تحميل نموذج التسجيل.");
    document.body.dataset.portalReady = "false";
    document.body.dataset.portalError = rawMessage.slice(0, 300);
    const message = rawMessage.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
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

    await loadScript("assets/js/file-cache.js");
    if (window.TallamFileCache?.build !== CACHE_COMPAT_BUILD) {
      throw new Error("تعذر تحميل أداة تثبيت المرفقات على الجوال.");
    }

    await loadScript("assets/js/app-core.js");
    await loadScript("assets/js/app-submit.js");
    await loadScript("assets/js/form-readiness-v2.js");
    await loadScript("assets/js/file-readiness-bridge.js");
    if (document.body.dataset.fileReadinessBridge !== "true") {
      throw new Error("تعذر تحميل أداة التحقق من ثبات المرفقات.");
    }
    document.body.dataset.portalReady = "true";
  } catch (error) {
    showFatalError(error);
  }
})();
