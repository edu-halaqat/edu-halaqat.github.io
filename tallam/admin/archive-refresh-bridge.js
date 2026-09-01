(() => {
  "use strict";

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
