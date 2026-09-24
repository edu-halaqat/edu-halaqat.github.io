(() => {
  "use strict";

  // Route detail reads to the dedicated endpoint (summary endpoint only lists rows).
  const originalFetch = window.fetch.bind(window);
  const legacyEndpoint = "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/admin-teacher-applications";
  const detailEndpoint = "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/admin-teacher-application-details";
  window.fetch = (input, init) => {
    try {
      const requestUrl = new URL(typeof input === "string" ? input : input.url, window.location.href);
      const method = String(init?.method || (typeof input !== "string" ? input.method : "GET")).toUpperCase();
      if (method === "GET" && requestUrl.origin + requestUrl.pathname === legacyEndpoint && requestUrl.searchParams.has("id")) {
        const routed = new URL(detailEndpoint);
        routed.searchParams.set("id", requestUrl.searchParams.get("id"));
        return originalFetch(routed.toString(), init);
      }
    } catch (error) {
      console.warn("Tallam detail endpoint routing skipped", error);
    }
    return originalFetch(input, init);
  };

  // Existing archive-refresh bridge.
  let pending = false;
  function rebuildArchive() {
    const button = document.getElementById("masterArchiveRebuild");
    if (!button || button.disabled) { pending = true; return; }
    pending = false;
    button.click();
  }
  window.addEventListener("tallam:archive-refresh", rebuildArchive);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && pending) rebuildArchive(); });
  window.setInterval(() => { if (pending) rebuildArchive(); }, 1500);

  // Add an inline-view link and a separate forced-download link per attachment.
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
        url.searchParams.set("download", filename);
        downloadUrl = url.toString();
      } catch { /* use signed preview URL as fallback */ }

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

  function startAttachmentObserver() {
    const grid = document.getElementById("attachmentsGrid");
    if (!grid) return;
    new MutationObserver(enhanceAttachments).observe(grid, { childList: true, subtree: true });
    enhanceAttachments();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startAttachmentObserver, { once: true });
  else startAttachmentObserver();
})();