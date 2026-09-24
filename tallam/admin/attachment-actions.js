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

  function addAttachmentActions(card) {
    if (!card || card.dataset.actionsReady === "1") return;
    const existingLink = card.querySelector("a[href]");
    if (!existingLink) return;

    const previewUrl = existingLink.getAttribute("href");
    const item = card;
    const downloadUrl = item.dataset.downloadUrl || previewUrl;
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";

    const view = document.createElement("a");
    view.href = previewUrl;
    view.target = "_blank";
    view.rel = "noopener noreferrer";
    view.textContent = "عرض";
    view.className = "row-btn";
    view.style.textDecoration = "none";

    const download = document.createElement("a");
    download.href = downloadUrl;
    download.target = "_blank";
    download.rel = "noopener noreferrer";
    download.textContent = "تنزيل المرفق";
    download.className = "row-btn";
    download.style.textDecoration = "none";

    existingLink.replaceWith(actions);
    actions.append(view, download);
    card.dataset.actionsReady = "1";
  }

  function enhanceAttachments() {
    const grid = document.getElementById("attachmentsGrid");
    if (!grid) return;
    grid.querySelectorAll(".attachment").forEach((card) => {
      if (card.dataset.actionsReady === "1") return;
      const originalLink = card.querySelector("a[href]");
      if (!originalLink) return;

      // Details endpoint returns a separate attachment URL with forced download disposition.
      const attachmentName = card.querySelector("span")?.textContent?.trim() || "";
      const downloadUrl = originalLink.dataset.downloadUrl || originalLink.href;
      card.dataset.downloadUrl = downloadUrl;
      addAttachmentActions(card);
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