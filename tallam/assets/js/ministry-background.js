(() => {
  "use strict";
  const parts = window.__TallamMinistryBackgroundParts;
  if (!Array.isArray(parts) || parts.length < 14 ||
      parts.slice(0, 14).some((part) => typeof part !== "string" || !part.length)) {
    throw new Error("تعذر تحميل خلفية استمارة الوزارة الرسمية كاملة.");
  }
  const base64 = parts.slice(0, 14).join("");
  if (base64.length !== 103900) {
    throw new Error("خلفية استمارة الوزارة غير مكتملة.");
  }
  window.TallamOfficialMinistryBackground = `data:image/webp;base64,${base64}`;
})();
