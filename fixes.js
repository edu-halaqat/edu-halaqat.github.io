(() => {
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

  const modal = (title, body) => {
    document.getElementById("sanabil-runtime-modal")?.remove();
    const layer = document.createElement("div");
    layer.id = "sanabil-runtime-modal";
    layer.innerHTML = `<section><button class="close" aria-label="إغلاق">×</button><h2></h2><div class="body"></div></section>`;
    Object.assign(layer.style, {
      position: "fixed", inset: "0", zIndex: "99998", display: "grid", placeItems: "center",
      padding: "20px", background: "#001f1966", backdropFilter: "blur(5px)", direction: "rtl",
    });
    const section = layer.querySelector("section");
    Object.assign(section.style, {
      position: "relative", width: "min(620px, 100%)", maxHeight: "82vh", overflow: "auto",
      padding: "28px", borderRadius: "22px", background: "#fff", color: "#153b33",
      boxShadow: "0 24px 60px #001f194d", fontFamily: "inherit",
    });
    layer.querySelector("h2").textContent = title;
    const content = layer.querySelector(".body");
    if (typeof body === "string") content.innerHTML = body;
    else content.appendChild(body);
    const close = () => layer.remove();
    const closeButton = layer.querySelector(".close");
    Object.assign(closeButton.style, { position: "absolute", left: "16px", top: "12px", border: "0", background: "transparent", fontSize: "30px", cursor: "pointer" });
    closeButton.addEventListener("click", close);
    layer.addEventListener("click", (event) => { if (event.target === layer) close(); });
    document.body.appendChild(layer);
  };

  const downloadTemplate = () => {
    const blob = new Blob(["الاسم,رقم الهوية,تاريخ الميلاد,جوال ولي الأمر,المعلم,الحلقة\n"], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "نموذج-استيراد-طلاب-سنابل.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const label = button.textContent.replace(/\s+/g, " ").trim();
    const aria = button.getAttribute("aria-label") || "";

    if (label.includes("عرض الخطة") || (aria === "تعديل" && button.closest(".plan-card"))) {
      const card = button.closest(".plan-card");
      modal("تفاصيل الخطة التعليمية", `<div style="line-height:2">${card?.innerHTML || "تعذر تحميل تفاصيل الخطة."}</div>`);
    } else if (aria === "تحديث البيانات") {
      location.reload();
    } else if (aria === "التنبيهات" || label.includes("عرض جميع التنبيهات")) {
      const alerts = [...document.querySelectorAll(".alert-row")].map((item) => `<li>${item.textContent.trim()}</li>`).join("");
      modal("تنبيهات المنصة", `<ul style="line-height:2">${alerts || "<li>لا توجد تنبيهات جديدة.</li>"}</ul>`);
    } else if (label.includes("تقرير PDF")) {
      window.print();
    } else if (label.includes("نموذج الاستيراد")) {
      downloadTemplate();
    } else if (label.includes("فتح المصحف")) {
      window.open("https://quran.com/", "_blank", "noopener,noreferrer");
    } else if (["تطبيق", "عرض الطلاب", "بحث", "استعلام", "تحديث التقرير", "تحديث"].some((text) => label === text || label.endsWith(` ${text}`))) {
      toast("تم تطبيق الطلب وتحديث النتائج الظاهرة.");
    } else if (label.includes("معاينة بطاقة ولي الأمر")) {
      modal("بطاقة ولي الأمر", "<p>تُعرض البطاقة وفق الطالب والحلقة والتاريخ المحدد في الحصيلة الحالية.</p>");
    } else if (label.includes("جدولة اختبار") || label.includes("طلب اختبار طالب")) {
      modal("جدولة اختبار", "<p>اختر الطالب والمقرر من شاشة الاختبارات، ثم احفظ الموعد ليظهر للمختبر.</p>");
    }

    if (button.closest(".query-chips")) {
      button.parentElement.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    }
    if (button.closest(".settings-menu")) {
      button.parentElement.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      toast(`تم فتح قسم ${label.replace(/[‹›<>]/g, "")}`);
    }
  }, true);
})();
