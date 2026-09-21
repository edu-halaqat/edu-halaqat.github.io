"use strict";
// The ministry form is now linked directly from application-2.html to the
// same-origin GitHub Pages asset. Do not rewrite it to raw.githubusercontent.com.
(() => {
  const FILE_URL = "https://edu-halaqat.github.io/tallam/assets/forms/%D8%A7%D8%B3%D8%AA%D9%85%D8%A7%D8%B1%D8%A9%20%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA%20%D9%88%D8%B2%D8%A7%D8%B1%D8%A9%20%D8%A7%D9%84%D8%B4%D8%A4%D9%88%D9%86%20%D8%A7%D9%84%D8%A7%D8%B3%D9%84%D8%A7%D9%85%D9%8A%D8%A9.docx";
  const apply = () => {
    const link = [...document.querySelectorAll('a')].find(a => a.textContent.includes("تنزيل استمارة الشؤون الإسلامية"));
    if (!link) return false;
    link.href = FILE_URL;
    link.setAttribute("download", "استمارة-بيانات-وزارة-الشؤون-الإسلامية.docx");
    link.removeAttribute("target");
    return true;
  };
  if (apply()) return;
  const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
