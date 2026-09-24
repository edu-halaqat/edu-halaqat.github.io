(() => {
  "use strict";

  // Keep archive-refresh behavior, while routing detail reads away from the
  // legacy endpoint that attempted to sign a null legacy-signature path.
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

  let pending = false;
  function rebuildArchive() {
    const button = document.getElementById("masterArchiveRebuild");
    if (!button || button.disabled) {
      pending = true;
      return;
    }
    pending = false;
    button.click();
  }
  window.addEventListener("tallam:archive-refresh", rebuildArchive);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pending) rebuildArchive();
  });
  window.setInterval(() => {
    if (pending) rebuildArchive();
  }, 1500);
})();
