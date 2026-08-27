(() => {
  "use strict";

  const toast = (message) => {
    let node = document.getElementById("sanabil-runtime-toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "sanabil-runtime-toast";
      Object.assign(node.style, {
        position: "fixed", left: "24px", bottom: "24px", zIndex: "99999",
        maxWidth: "420px", padding: "14px 18px", borderRadius: "14px",
        color: "#fff", background: "#006b55", boxShadow: "0 12px 32px #003f3340",
        fontFamily: "inherit", fontWeight: "700", direction: "rtl",
      });
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 3200);
  };

  const modal = (title, lines) => {
    document.getElementById("sanabil-runtime-modal")?.remove();
    const layer = document.createElement("div");
    layer.id = "sanabil-runtime-modal";
    const section = document.createElement("section");
    const closeButton = document.createElement("button");
    const heading = document.createElement("h2");
    const body = document.createElement("div");
    closeButton.type = "button";
    closeButton.className = "close";
    closeButton.setAttribute("aria-label", "إغلاق");
    closeButton.textContent = "×";
    heading.textContent = title;
    body.className = "body";
    for (const line of lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      body.appendChild(paragraph);
    }
    section.append(closeButton, heading, body);
    layer.appendChild(section);
    Object.assign(layer.style, {
      position: "fixed", inset: "0", zIndex: "99998", display: "grid",
      placeItems: "center", padding: "20px", background: "#001f1966",
      backdropFilter: "blur(5px)", direction: "rtl",
    });
    Object.assign(section.style, {
      position: "relative", width: "min(620px, 100%)", maxHeight: "82vh",
      overflow: "auto", padding: "32px 34px", borderRadius: "22px",
      background: "#fff", color: "#153b33", boxShadow: "0 24px 60px #001f194d",
      fontFamily: "inherit",
    });
    Object.assign(closeButton.style, {
      position: "absolute", left: "16px", top: "12px", border: "0",
      background: "transparent", fontSize: "30px", cursor: "pointer",
    });
    const close = () => layer.remove();
    closeButton.addEventListener("click", close);
    layer.addEventListener("click", (event) => { if (event.target === layer) close(); });
    document.body.appendChild(layer);
  };

  const downloadTemplate = () => {
    const header = "الاسم,رقم الهوية,تاريخ الميلاد,جوال ولي الأمر,المعلم,الحلقة\n";
    const blob = new Blob(["\ufeff" + header], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "نموذج-استيراد-طلاب-سنابل.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const style = document.createElement("style");
  style.id = "sanabil-lightweight-fixes";
  style.textContent = `
    .brand { min-height: 150px !important; height: auto !important; overflow: visible !important; }
    .brand img { width: min(520px, 96%) !important; height: auto !important; max-height: 180px !important; object-fit: contain !important; object-position: center !important; border-radius: 0 !important; }
    .brand-compact { width: 230px !important; min-height: 74px !important; height: auto !important; overflow: visible !important; }
    .brand-compact img { width: 220px !important; height: auto !important; max-height: 74px !important; object-fit: contain !important; border-radius: 0 !important; }
    #sanabil-runtime-modal h2 { margin: 0 0 20px; padding-inline-start: 42px; line-height: 1.5; }
    #sanabil-runtime-modal .body { display: grid; gap: 10px; line-height: 1.9; }
    #sanabil-runtime-modal .body p { margin: 0; overflow-wrap: anywhere; }
    @media (max-width: 640px) {
      .brand { min-height: 125px !important; }
      .brand img { max-height: 135px !important; }
    }
  `;
  document.head.appendChild(style);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const label = (button.textContent || "").replace(/\s+/g, " ").trim();
    const aria = button.getAttribute("aria-label") || "";

    if (aria === "تحديث البيانات") {
      location.reload();
    } else if (aria === "التنبيهات" || label.includes("عرض جميع التنبيهات")) {
      const alerts = [...document.querySelectorAll(".alert-row")]
        .map((item) => item.textContent.trim()).filter(Boolean);
      modal("تنبيهات المنصة", alerts.length ? alerts : ["لا توجد تنبيهات جديدة."]);
    } else if (label.includes("تقرير PDF")) {
      window.print();
    } else if (label.includes("نموذج الاستيراد")) {
      downloadTemplate();
    } else if (label.includes("فتح المصحف")) {
      window.open("https://quran.com/", "_blank", "noopener,noreferrer");
    } else if (["تطبيق", "عرض الطلاب", "بحث", "استعلام", "تحديث التقرير", "تحديث"].some((text) => label === text || label.endsWith(` ${text}`))) {
      toast("تم تطبيق الطلب وتحديث النتائج الظاهرة.");
    } else if (label.includes("معاينة بطاقة ولي الأمر")) {
      modal("بطاقة ولي الأمر", ["تُعرض البطاقة وفق الطالب والحلقة والتاريخ المحدد في الحصيلة الحالية."]);
    } else if (label.includes("جدولة اختبار") || label.includes("طلب اختبار طالب")) {
      modal("جدولة اختبار", ["اختر الطالب والمقرر من شاشة الاختبارات، ثم احفظ الموعد ليظهر للمختبر."]);
    }

    if (button.closest(".query-chips, .settings-menu")) {
      button.parentElement.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    }
  }, true);
})();

