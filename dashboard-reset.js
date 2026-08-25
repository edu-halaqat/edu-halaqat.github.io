(() => {
  const emptyReplacements = new Map([
    ["3 معلمين لم يسجلوا الحضور", "لا توجد سجلات حضور"],
    ["88 طالبًا بانتظار الرصد", "لا توجد حصائل معلقة"],
    ["17 اختبارًا خلال اليوم", "لا توجد اختبارات قادمة"],
    ["+18 هذا الشهر", "لا توجد بيانات"],
    ["12 حلقة تعليمية", "لا توجد بيانات"],
    ["88٪ من المعلمين", "لا توجد بيانات"],
    ["69٪ من الطلاب", "لا توجد بيانات"],
    ["4 قيد المراجعة", "لا توجد بيانات"],
  ]);
  const metricLabels = new Set([
    "إجمالي الطلاب", "المعلمون النشطون", "الحاضرون اليوم",
    "الحصائل المكتملة", "اختبارات اليوم",
  ]);
  const demoMarkers = [
    "الشيخ محمد حسن", "الشيخ الأمين مهدي", "الشيخ عبد الرحمن", "الشيخ أحمد الداه",
    "عبد المجيد الأمين", "محمود الأمين", "أحمد محمود محمد سيدي",
    "باسل سعد الدين سمير", "عمر أحمد محمد لمين",
    "موعد اختبار قريب", "مزامنة ناجحة",
  ];

  const hijriToday = () => new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());

  const replaceExactText = (root, from, to) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.trim() === from) node.nodeValue = node.nodeValue.replace(from, to);
    }
  };

  const scrub = () => {
    const date = document.querySelector(".hero-kicker");
    if (date && date.textContent.trim() !== hijriToday()) date.textContent = hijriToday();

    document.querySelectorAll("p").forEach((node) => {
      if (node.textContent.includes("لديك 7 عناصر تحتاج إلى متابعة اليوم")) {
        node.textContent = "هذه خلاصة العمل اليوم. لا توجد عناصر تحتاج إلى متابعة حتى الآن.";
      }
    });

    for (const [from, to] of emptyReplacements) replaceExactText(document.body, from, to);

    document.querySelectorAll("article, section, div").forEach((container) => {
      const texts = [...container.childNodes].map((node) => node.textContent?.trim()).filter(Boolean);
      if (!texts.some((text) => metricLabels.has(text))) return;
      const value = [...container.querySelectorAll("b, strong, span")]
        .find((node) => /^\d+$/.test(node.textContent.trim()));
      if (value && value.textContent !== "0") value.textContent = "0";
    });

    document.querySelectorAll(".progress-row, .alert-row, tbody tr, .plan-card").forEach((node) => {
      if (demoMarkers.some((marker) => node.textContent.includes(marker))) node.remove();
    });

    document.querySelectorAll(".progress-list, .alerts-list").forEach((list) => {
      const itemSelector = list.classList.contains("progress-list") ? ".progress-row" : ".alert-row";
      if (!list.querySelector(itemSelector) && !list.querySelector(".sanabil-empty-state")) {
        const empty = document.createElement("p");
        empty.className = "sanabil-empty-state";
        empty.textContent = list.classList.contains("progress-list")
          ? "لا توجد بيانات إنجاز حتى الآن."
          : "لا توجد تنبيهات حتى الآن.";
        list.appendChild(empty);
      }
    });
  };

  // Run only during initial hydration. A permanent observer can interfere with
  // React while dynamically mounting the platform modules.
  [0, 250, 750, 1500, 3000].forEach((delay) => setTimeout(scrub, delay));
})();

