(() => {
  "use strict";

  const form = document.getElementById("teacherForm");
  if (!form) return;

  const steps = [...form.querySelectorAll(".form-step")];
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");
  const statusBox = document.getElementById("formStatus");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const formArea = document.getElementById("formArea");
  const canvas = document.getElementById("signatureCanvas");
  const personalPhoto = form.elements.personal_photo;

  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
  const REQUIRED_FILE_NAMES = new Set([
    "educational_certificate", "cv", "recommendation_1", "recommendation_2",
    "quran_certificates", "identity_document", "iban_document"
  ]);

  let assetsReady = false;
  let assetsError = "";
  let refreshFrame = 0;
  let photoState = personalPhoto?.files?.[0] ? "checking" : "empty";
  let photoError = "";

  injectStyles();
  const finalNotice = installFinalStepNotice();
  const readinessBox = installReadinessBox();
  installExporterImageGuard();
  installListeners();
  refreshControls();
  void preflightExportAssets();

  function injectStyles() {
    if (document.getElementById("tallam-readiness-styles")) return;
    const style = document.createElement("style");
    style.id = "tallam-readiness-styles";
    style.textContent = `
      [hidden]{display:none!important}
      .btn:disabled,.btn[aria-disabled="true"]{opacity:.5!important;cursor:not-allowed!important;transform:none!important;box-shadow:none!important;filter:saturate(.55)}
      .final-step-notice{margin:0 0 18px;padding:14px 16px;border:1px solid #bcded9;border-radius:14px;background:#edf8f6;color:#075c5a;line-height:1.7}
      .final-step-notice strong{display:block;font-size:1.03rem;color:#004f4e}
      .submission-readiness{display:none;margin:0 28px 18px;padding:12px 15px;border-radius:12px;border:1px solid #e7d4b3;background:#fff8ed;color:#745323;font-weight:700;line-height:1.65}
      .submission-readiness.show{display:block}
      .submission-readiness.ready{border-color:#bee5d5;background:#ebf8f2;color:#087a55}
      .submission-readiness.error{border-color:#f3c4c0;background:#fff1f0;color:#b42318}
      @media(max-width:680px){.submission-readiness{margin-right:16px;margin-left:16px}}
    `;
    document.head.appendChild(style);
  }

  function installFinalStepNotice() {
    const lastStep = steps.at(-1);
    if (!lastStep) return null;
    let notice = lastStep.querySelector(".final-step-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "final-step-notice";
      notice.setAttribute("role", "status");
      notice.innerHTML = "<strong>هذه هي الخطوة الأخيرة في النموذج.</strong><span>راجع ملخص بياناتك، وأضف توقيعك، ووافق على التعهد وسياسة الخصوصية. لن يتاح الإرسال إلا بعد اكتمال جميع البيانات والمرفقات المطلوبة.</span>";
      const heading = lastStep.querySelector(".section-title");
      heading?.insertAdjacentElement("afterend", notice);
    }
    return notice;
  }

  function installReadinessBox() {
    let box = document.getElementById("submissionReadiness");
    if (!box) {
      box = document.createElement("div");
      box.id = "submissionReadiness";
      box.className = "submission-readiness";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      statusBox?.insertAdjacentElement("beforebegin", box);
    }
    return box;
  }

  function installListeners() {
    form.addEventListener("input", scheduleRefresh, true);
    form.addEventListener("change", scheduleRefresh, true);
    form.addEventListener("submit", scheduleRefresh, true);

    nextBtn?.addEventListener("click", () => requestAnimationFrame(refreshControls), true);
    prevBtn?.addEventListener("click", () => requestAnimationFrame(refreshControls), true);

    if (canvas) {
      canvas.addEventListener("pointerup", scheduleRefresh, true);
      canvas.addEventListener("pointercancel", scheduleRefresh, true);
      canvas.addEventListener("touchend", scheduleRefresh, { capture: true, passive: true });
    }

    document.getElementById("clearSignature")?.addEventListener("click", () => requestAnimationFrame(refreshControls), true);

    personalPhoto?.addEventListener("change", () => void inspectPersonalPhoto(), true);
    form.querySelectorAll('input[name="gender"]').forEach((control) => control.addEventListener("change", scheduleRefresh, true));

    const observer = new MutationObserver(scheduleRefresh);
    steps.forEach((step) => observer.observe(step, { attributes: true, attributeFilter: ["class", "hidden"] }));
    if (loadingOverlay) observer.observe(loadingOverlay, { attributes: true, attributeFilter: ["class"] });
    if (formArea) observer.observe(formArea, { attributes: true, attributeFilter: ["hidden"] });
  }

  function scheduleRefresh() {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(refreshControls);
  }

  function activeStepIndex() {
    const index = steps.findIndex((step) => step.classList.contains("active"));
    return index >= 0 ? index : 0;
  }

  function refreshControls() {
    const current = activeStepIndex();
    const isLast = current === steps.length - 1;
    const busy = Boolean(loadingOverlay?.classList.contains("show"));
    const succeeded = Boolean(formArea?.hidden);
    const report = collectIssues();
    const ready = isLast && assetsReady && report.length === 0 && !busy && !succeeded;

    if (nextBtn) {
      nextBtn.hidden = isLast;
      nextBtn.disabled = isLast || busy;
      nextBtn.setAttribute("aria-hidden", isLast ? "true" : "false");
      nextBtn.style.display = isLast ? "none" : "inline-flex";
    }

    if (prevBtn) prevBtn.disabled = busy || current === 0;

    if (submitBtn) {
      submitBtn.hidden = !isLast;
      submitBtn.disabled = !ready;
      submitBtn.setAttribute("aria-disabled", ready ? "false" : "true");
      submitBtn.title = ready
        ? "اكتملت البيانات ويمكن إرسال الطلب وإصدار الاستمارة."
        : submitDisabledReason(report, busy);
    }

    if (finalNotice) finalNotice.hidden = !isLast;
    updateReadinessMessage({ isLast, ready, report, busy, succeeded });
  }

  function submitDisabledReason(report, busy) {
    if (busy) return "جارٍ إرسال الطلب وإصدار الاستمارة.";
    if (assetsError) return assetsError;
    if (!assetsReady) return "جارٍ التحقق من قالب الاستمارة وأدوات الإصدار.";
    if (report.length) return `استكمل: ${report.slice(0, 3).join("، ")}.`;
    return "انتقل إلى الخطوة الأخيرة لإرسال الطلب.";
  }

  function updateReadinessMessage({ isLast, ready, report, busy, succeeded }) {
    if (!readinessBox) return;
    readinessBox.className = "submission-readiness";
    readinessBox.hidden = !isLast || succeeded;
    readinessBox.classList.toggle("show", isLast && !succeeded);
    if (!isLast || succeeded) return;

    if (busy) {
      readinessBox.textContent = "جارٍ تجهيز الطلب وإصدار الاستمارة؛ يرجى عدم إغلاق الصفحة.";
      return;
    }
    if (assetsError) {
      readinessBox.classList.add("error");
      readinessBox.textContent = assetsError;
      return;
    }
    if (!assetsReady) {
      readinessBox.textContent = "جارٍ التحقق من قالب الاستمارة الرسمية وأدوات إنشاء Word وPDF…";
      return;
    }
    if (ready) {
      readinessBox.classList.add("ready");
      readinessBox.textContent = "اكتملت جميع البيانات والمرفقات والتوقيع، وأصبح الطلب جاهزًا للإرسال وإصدار الاستمارة.";
      return;
    }

    const visible = report.slice(0, 4).join("، ");
    const remaining = report.length > 4 ? `، و${report.length - 4} متطلبات أخرى` : "";
    readinessBox.textContent = `لا يزال الإرسال معطّلًا. استكمل: ${visible}${remaining}.`;
  }

  function collectIssues() {
    const issues = [];
    const handledRadioNames = new Set();

    for (const control of form.elements) {
      if (!control?.name || control.name === "website" || control.disabled || control.type === "hidden") continue;

      if (control.type === "radio") {
        if (handledRadioNames.has(control.name)) continue;
        handledRadioNames.add(control.name);
        const group = [...form.querySelectorAll(`input[type="radio"][name="${CSS.escape(control.name)}"]`)];
        if (group.some((item) => item.required) && !group.some((item) => item.checked)) issues.push(labelFor(control));
        continue;
      }

      if (control.type === "file") {
        const file = control.files?.[0] || null;
        const required = control.required || REQUIRED_FILE_NAMES.has(control.name) || (control.name === "personal_photo" && fieldValue("gender") === "ذكر");
        if (required && !file) {
          issues.push(labelFor(control));
          continue;
        }
        if (file && file.size > MAX_FILE_BYTES) issues.push(`${labelFor(control)}: الحجم أكبر من 8 ميغابايت`);
        if (file && !matchesAccept(control, file)) issues.push(`${labelFor(control)}: صيغة الملف غير مسموح بها`);
        if (control.name === "personal_photo" && file) {
          if (photoState === "checking") issues.push("التحقق من الصورة الشخصية");
          if (photoState === "invalid") issues.push(photoError || "الصورة الشخصية غير قابلة للقراءة");
        }
        continue;
      }

      if (control.type === "checkbox") {
        if (control.required && !control.checked) issues.push(labelFor(control));
        continue;
      }

      const value = String(control.value || "").trim();
      if (control.required && !value) {
        issues.push(labelFor(control));
        continue;
      }
      if (!value) continue;

      if (control.name === "full_name" && value.split(/\s+/).filter(Boolean).length < 4) issues.push("الاسم الرباعي كاملًا");
      else if (control.name === "identity_number" && !/^\d{10}$/.test(normalizeDigits(value).replace(/\D/g, ""))) issues.push("رقم الهوية أو الإقامة الصحيح");
      else if (control.name === "identity_expiry" && !validFutureDate(value)) issues.push("تاريخ هوية ساري");
      else if (control.name === "mobile" && !/^5\d{8}$/.test(normalizeMobile(value))) issues.push("رقم جوال سعودي صحيح");
      else if (control.name === "iban" && !/^SA\d{22}$/.test(normalizeIban(value))) issues.push("رقم آيبان سعودي صحيح");
      else if (!control.checkValidity()) issues.push(labelFor(control));
    }

    const totalBytes = [...form.querySelectorAll('input[type="file"]')]
      .reduce((sum, input) => sum + (input.files?.[0]?.size || 0), 0);
    if (totalBytes > MAX_TOTAL_BYTES) issues.push("خفض إجمالي المرفقات إلى 40 ميغابايت أو أقل");
    if (!hasSignature()) issues.push("التوقيع الإلكتروني");

    return [...new Set(issues)];
  }

  function fieldValue(name) {
    const controls = form.elements[name];
    if (!controls) return "";
    if (typeof controls.length === "number" && !controls.tagName) {
      const checked = [...controls].find((control) => control.checked);
      return String(checked?.value || "").trim();
    }
    return String(controls.value || "").trim();
  }

  function labelFor(control) {
    const direct = control.id ? form.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
    const label = direct || control.closest(".field,.file-card")?.querySelector("label");
    const text = String(label?.textContent || control.name || "حقل مطلوب")
      .replace(/\*/g, "").replace(/\s+/g, " ").trim();
    const names = {
      gender: "الجنس", has_sanad: "بيان الإسناد", has_madaniyah: "شهادة القاعدة المدنية",
      has_nooraniyah: "شهادة القاعدة النورانية", declaration_accepted: "قبول التعهد",
      privacy_accepted: "الموافقة على سياسة الخصوصية"
    };
    return names[control.name] || text;
  }

  function normalizeDigits(value) {
    const arabic = "٠١٢٣٤٥٦٧٨٩";
    const persian = "۰۱۲۳۴۵۶۷۸۹";
    return String(value || "")
      .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)));
  }

  function normalizeMobile(value) {
    let mobile = normalizeDigits(value).replace(/\D/g, "");
    if (mobile.startsWith("966")) mobile = mobile.slice(3);
    if (mobile.startsWith("0")) mobile = mobile.slice(1);
    return mobile;
  }

  function normalizeIban(value) {
    return normalizeDigits(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function validFutureDate(value) {
    const expiry = Date.parse(`${value}T23:59:59`);
    return Number.isFinite(expiry) && expiry >= Date.now();
  }

  function matchesAccept(input, file) {
    const accept = String(input.accept || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (!accept.length) return true;
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    return accept.some((rule) => {
      if (rule.startsWith(".")) return name.endsWith(rule);
      if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
      if (type && rule === type) return true;
      if (rule === "image/jpeg") return /\.(jpe?g)$/i.test(name);
      if (rule === "image/png") return /\.png$/i.test(name);
      if (rule === "application/pdf") return /\.pdf$/i.test(name);
      return false;
    });
  }

  function hasSignature() {
    if (!canvas) return false;
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 3; index < data.length; index += 64) if (data[index] > 8) return true;
      return false;
    } catch (_) {
      try { return typeof signatureDirty !== "undefined" && Boolean(signatureDirty); } catch (_) { return false; }
    }
  }

  async function inspectPersonalPhoto() {
    const file = personalPhoto?.files?.[0] || null;
    photoError = "";
    if (!file) {
      photoState = "empty";
      scheduleRefresh();
      return;
    }
    photoState = "checking";
    scheduleRefresh();
    try {
      await assertReadableImage(file, "الصورة الشخصية");
      photoState = "valid";
    } catch (error) {
      photoState = "invalid";
      photoError = error?.message || "تعذر قراءة الصورة الشخصية.";
    }
    scheduleRefresh();
  }

  async function preflightExportAssets() {
    assetsReady = false;
    assetsError = "";
    scheduleRefresh();
    try {
      if (!window.JSZip) throw new Error("تعذر تحميل أداة إنشاء ملفات Word وPDF. حدّث الصفحة وتحقق من اتصال الإنترنت.");
      if (!window.TallamMinistryExporter?.generate) throw new Error("تعذر تحميل أداة إصدار الاستمارة الرسمية. حدّث الصفحة ثم أعد المحاولة.");
      if (!window.TallamOfficialMinistryBackground) throw new Error("تعذر تحميل خلفية استمارة الوزارة الرسمية.");
      await assertReadableImage(window.TallamOfficialMinistryBackground, "خلفية استمارة الوزارة الرسمية", { minimumWidth: 1000, minimumHeight: 1400 });
      assetsReady = true;
    } catch (error) {
      assetsError = error?.message || "تعذر تجهيز قالب الاستمارة الرسمية.";
    }
    scheduleRefresh();
  }

  function installExporterImageGuard() {
    const original = window.TallamMinistryExporter;
    if (!original?.generate || original.__imageGuarded) return;
    window.TallamMinistryExporter = Object.freeze({
      ...original,
      __imageGuarded: true,
      async generate(options) {
        await assertReadableImage(window.TallamOfficialMinistryBackground, "خلفية استمارة الوزارة الرسمية", { minimumWidth: 1000, minimumHeight: 1400 });
        if (options?.photoFile) await assertReadableImage(options.photoFile, "الصورة الشخصية");
        if (options?.signatureBlob) await assertReadableImage(options.signatureBlob, "صورة التوقيع الإلكتروني");
        try {
          return await original.generate(options);
        } catch (error) {
          if (String(error?.message || "").includes("تعذر قراءة إحدى صور الاستمارة")) {
            throw new Error("تعذر تجهيز إحدى صور الاستمارة بعد التحقق منها. حدّث الصفحة وأعد اختيار الصورة الشخصية ثم حاول مجددًا.");
          }
          throw error;
        }
      }
    });
  }

  function assertReadableImage(source, label, limits = {}) {
    const minimumWidth = limits.minimumWidth || 1;
    const minimumHeight = limits.minimumHeight || 1;
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      let objectUrl = "";
      let settled = false;
      const timeout = window.setTimeout(() => finish(new Error(`استغرق التحقق من ${label} وقتًا طويلًا.`)), 15000);

      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (error) reject(error); else resolve(image);
      };

      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (width < minimumWidth || height < minimumHeight) {
          finish(new Error(`${label} غير مكتملة أو أبعادها غير صالحة.`));
          return;
        }
        finish();
      };
      image.onerror = () => finish(new Error(`تعذر قراءة ${label}. استخدم ملفًا سليمًا بصيغة JPG أو PNG.`));

      try {
        if (source instanceof Blob) {
          objectUrl = URL.createObjectURL(source);
          image.src = objectUrl;
        } else {
          image.src = String(source || "");
        }
      } catch (_) {
        finish(new Error(`تعذر قراءة ${label}.`));
      }
    });
  }
})();
