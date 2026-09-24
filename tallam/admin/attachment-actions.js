(() => {
  "use strict";

  // Route detail requests to the dedicated, privileged details function.
  const listEndpoint = "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/admin-teacher-applications";
  const detailEndpoint = "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/admin-teacher-application-details";
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init = {}) {
    try {
      const requestUrl = new URL(typeof input === "string" ? input : input.url, window.location.href);
      const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "GET" && requestUrl.origin === new URL(listEndpoint).origin && requestUrl.pathname === new URL(listEndpoint).pathname && requestUrl.searchParams.has("id")) {
        requestUrl.pathname = new URL(detailEndpoint).pathname;
        return nativeFetch(requestUrl.toString(), init);
      }
    } catch (error) {
      console.warn("Could not route application detail request", error);
    }
    return nativeFetch(input, init);
  };

  function enhanceAttachments() {
    const grid = document.getElementById("attachmentsGrid");
    if (!grid) return;
    grid.querySelectorAll(".attachment").forEach((card) => {
      if (card.dataset.actionsReady === "1") return;
      const originalLink = card.querySelector("a[href]");
      if (!originalLink) return;

      const previewUrl = originalLink.href;
      const filename = card.querySelector("span")?.textContent?.trim() || "attachment";
      let downloadUrl = previewUrl;
      try {
        const url = new URL(previewUrl);
        // Supabase Storage supports a download response override on signed URLs.
        url.searchParams.set("download", filename);
        downloadUrl = url.toString();
      } catch { /* retain the valid signed URL as a fallback */ }

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";

      const view = document.createElement("a");
      view.href = previewUrl;
      view.target = "_blank";
      view.rel = "noopener noreferrer";
      view.textContent = "عرض";
      view.className = "row-btn";
      view.style.textDecoration = "none";
      view.setAttribute("aria-label", `عرض ${filename}`);

      const download = document.createElement("a");
      download.href = downloadUrl;
      download.target = "_blank";
      download.rel = "noopener noreferrer";
      download.textContent = "تنزيل المرفق";
      download.className = "row-btn";
      download.style.textDecoration = "none";
      download.setAttribute("aria-label", `تنزيل ${filename}`);

      originalLink.replaceWith(actions);
      actions.append(view, download);
      card.dataset.actionsReady = "1";
    });
  }

  const start = () => {
    const grid = document.getElementById("attachmentsGrid");
    if (!grid) return;
    new MutationObserver(enhanceAttachments).observe(grid, { childList: true, subtree: true });
    enhanceAttachments();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();