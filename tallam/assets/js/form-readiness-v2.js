(() => {
  "use strict";

  const BUILD = "20260901-synchronized-export-repair-v2";
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
  const REQUIRED_FILES = new Set([
    "educational_certificate", "cv", "recommendation_1", "recommendation_2",
    "quran_certificates", "identity_document", "iban_document"
  ]);
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

  let assetsReady = false;
  let assetsError = "";
  let photoState = personalPhoto?.files?.[0] ? "checking" : "empty";
  let photoError = "";
  let refreshFrame = 0;

  injectStyles();
  const finalNotice = installFinalNotice();
  const readinessBox = installReadinessBox();
  installListeners();
  refreshControls();
  void preflightAssets();

  function injectStyles() {
    if (document.getElementById("tallam-readiness-v2-styles")) return;
    const style = document.createElement("style");
    style.id = "tallam-readiness-v2-styles";
    style.textContent = `
      [hidden]{display:none!important}
      .btn:disabled,.btn[aria-disabled="true"]{opacity:.5!important;cursor:not-allowed!important;transform:none!important;box-shadow:none!important;filter:saturate(.55)}
      .final-step-notice{margin:0 0 18px;padding:14px 16px;border:1px solid #bcded9;border-radius:14px;background:#edf8f6;color:#075c5a;line-height:1.7}
      .final-step-notice strong{display:block;font-size:1.03rem;color:#004f4e}
      .submission-readiness{display:none;margin:0 28px 18px;padding:12px 15px;border-radius:12px;border:1px solid #e7d4b3;background:#fff8ed;color:#745323;font-weight:700;line-height:1.65}
      .submission-readiness.show{display:block}.submission-readiness.ready{border-color:#bee5d5;background:#ebf8f2;color:#087a55}.submission-readiness.error{border-color:#f3c4c0;background:#fff1f0;color:#b42318}
      @media(max-width:680px){.submission-readiness{margin-right:16px;margin-left:16px}}
    `;
    document.head.append(style);
  }

  function installFinalNotice() {
    const last = steps.at(-1);
    if (!last) return null;
    let notice = last.querySelector(".final-step-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "final-step-notice";
      notice.setAttribute("role", "status");
      notice.innerHTML = "<strong>هذه هي الخطوة الأخيرة في النموذج.</strong><span>راجع البيانات والتوقيع والتعهدين. لن يتاح الإرسال إلا بعد اكتمال الحقول والمرفقات وثبات الملفات على الجهاز.</span>";
      last.querySelector(".section-title")?.insertAdjacentElement("afterend", notice);
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
    form.addEventListener("change", (event) => {
      const input = event.target;
      if (input === personalPhoto) void inspectPersonalPhoto();
      scheduleRefresh();
    });
    form.addEventListener("tallam:file-cache-state", (event) => {
      if (event.detail?.name === "personal_photo" && event.detail?.state === "ready") void inspectPersonalPhoto();
      scheduleRefresh();
    });
    nextBtn?.addEventListener("click", () => requestAnimationFrame(refreshControls), true);
    prevBtn?.addEventListener("click", () => requestAnimationFrame(refreshControls), true);
    canvas?.addEventListener("pointerup", scheduleRefresh, true);
    canvas?.addEventListener("pointercancel", scheduleRefresh, true);
    canvas?.addEventListener("touchend", scheduleRefresh, { capture: true, passive: true });
    document.getElementById("clearSignature")?.addEventListener("click", () => requestAnimationFrame(refreshControls), true);
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
    const issues = collectIssues();
    const ready = isLast && assetsReady && issues.length === 0 && !busy && !succeeded;

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
        ? "اكتملت البيانات ويمكن إرسال الطلب وإنشاء Word وPDF المتزامنين."
        : disabledReason(issues, busy, isLast);
    }
    if (finalNotice) finalNotice.hidden = !isLast;
    updateMessage({ isLast, ready, issues, busy, succeeded });
  }

  function disabledReason(issues, busy, isLast) {
    if (busy) return "جارٍ حفظ الطلب وإنشاء الاستمارة.";
    if (!isLast) return "انتقل إلى الخطوة الأخيرة لإرسال الطلب.";
    if (assetsError) return assetsError;
    if (!assetsReady) return "جارٍ التحقق من القالب الرسمي ومحرك التصدير المتزامن.";
    if (issues.length) return `استكمل: ${issues.slice(0, 3).join("، ")}.`;
    return "يرجى مراجعة الطلب.";
  }

  function updateMessage({ isLast, ready, issues, busy, succeeded }) {
    if (!readinessBox) return;
    readinessBox.className = "submission-readiness";
    readinessBox.hidden = !isLast || succeeded;
    readinessBox.classList.toggle("show", isLast && !succeeded);
    if (!isLast || succeeded) return;
    if (busy) {
      readinessBox.textContent = "جارٍ حفظ الطلب وإنشاء الصفحة المرجعية وملفي Word وPDF؛ يرجى عدم إغلاق الصفحة.";
    } else if (assetsError) {
      readinessBox.classList.add("error");
      readinessBox.textContent = assetsError;
    } else if (!assetsReady) {
      readinessBox.textContent = "جارٍ التحقق من القالب الرسمي ومحرك التصدير المتزامن…";
    } else if (ready) {
      readinessBox.classList.add("ready");
      readinessBox.textContent = "اكتملت جميع البيانات والمرفقات والتوقيع، وأصبح الطلب جاهزًا للإرسال.";
    } else {
      const visible = issues.slice(0, 4).join("، ");
      const remaining = issues.length > 4 ? `، و${issues.length - 4} متطلبات أخرى` : "";
      readinessBox.textContent = `لا يزال الإرسال معطّلًا. استكمل: ${visible}${remaining}.`;
    }
  }

  function collectIssues() {
    const issues = [];
    const handledRadios = new Set();
    for (const control of form.elements) {
      if (!control?.name || control.name === "website" || control.disabled || control.type === "hidden") continue;
      if (control.type === "radio") {
        if (handledRadios.has(control.name)) continue;
        handledRadios.add(control.name);
        const group = [...form.querySelectorAll(`input[type="radio"][name="${CSS.escape(control.name)}"]`)];
        if (group.some((item) => item.required) && !group.some((item) => item.checked)) issues.push(labelFor(control));
        continue;
      }
      if (control.type === "file") {
        const file = control.files?.[0] || null;
        const required = control.required || REQUIRED_FILES.has(control.name) || (control.name === "personal_photo" && fieldValueLocal("gender") === "ذكر");
        if (required && !file) issues.push(labelFor(control));
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
    const total = [...form.querySelectorAll('input[type="file"]')].reduce((sum, input) => sum + (input.files?.[0]?.size || 0), 0);
    if (total > MAX_TOTAL_BYTES) issues.push("خفض إجمالي المرفقات إلى 40 ميغابايت أو أقل");
    if (!hasSignature()) issues.push("التوقيع الإلكتروني");
    return [...new Set(issues)];
  }

  function fieldValueLocal(name) {
    const controls = form.elements[name];
    if (!controls) return "";
    if (typeof controls.length === "number" && !controls.tagName) return String([...controls].find((item) => item.checked)?.value || "").trim();
    return String(controls.value || "").trim();
  }

  function labelFor(control) {
    const direct = control.id ? form.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
    const label = direct || control.closest(".field,.file-card")?.querySelector("label");
    const text = String(label?.textContent || control.name || "حقل مطلوب").replace(/\*/g, "").replace(/\s+/g, " ").trim();
    const names = {
      gender: "الجنس", has_sanad: "بيان الإسناد", has_madaniyah: "شهادة القاعدة المدنية",
      has_nooraniyah: "شهادة القاعدة النورانية", declaration_accepted: "قبول التعهد",
      privacy_accepted: "الموافقة على سياسة الخصوصية"
    };
    return names[control.name] || text;
  }

  function normalizeDigits(value) {
    const ar = "٠١٢٣٤٥٦٧٨٩", fa = "۰۱۲۳۴۵۶۷۸۹";
    return String(value || "").replace(/[٠-٩]/g, (d) => String(ar.indexOf(d))).replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  }
  function normalizeMobile(value) {
    let result = normalizeDigits(value).replace(/\D/g, "");
    if (result.startsWith("966")) result = result.slice(3);
    if (result.startsWith("0")) result = result.slice(1);
    return result;
  }
  function normalizeIban(value) { return normalizeDigits(value).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function validFutureDate(value) { const time = Date.parse(`${value}T23:59:59`); return Number.isFinite(time) && time >= Date.now(); }

  function matchesAccept(input, file) {
    const rules = String(input.accept || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (!rules.length) return true;
    const type = String(file.type || "").toLowerCase(), name = String(file.name || "").toLowerCase();
    return rules.some((rule) => rule.startsWith(".") ? name.endsWith(rule) : rule.endsWith("/*") ? type.startsWith(rule.slice(0, -1)) : rule === type || (rule === "image/jpeg" && /\.jpe?g$/i.test(name)) || (rule === "image/png" && /\.png$/i.test(name)) || (rule === "application/pdf" && /\.pdf$/i.test(name)));
  }

  function hasSignature() {
    try {
      if (typeof signatureDirty !== "undefined" && signatureDirty) return true;
    } catch { /* use pixels */ }
    if (!canvas) return false;
    try {
      const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < data.length; index += 64) if (data[index] > 8) return true;
    } catch { /* ignored */ }
    return false;
  }

  async function inspectPersonalPhoto() {
    const input = personalPhoto;
    const original = input?.files?.[0] || null;
    photoError = "";
    if (!original) {
      photoState = "empty";
      scheduleRefresh();
      return;
    }
    photoState = "checking";
    scheduleRefresh();
    try {
      const stable = await window.TallamFileCache?.getInputFile?.(input) || original;
      await assertReadableImage(stable, "الصورة الشخصية");
      photoState = "valid";
    } catch (error) {
      photoState = "invalid";
      photoError = window.TallamFileCache?.friendlyError?.(error, "الصورة الشخصية") || error?.message || "تعذر قراءة الصورة الشخصية.";
    }
    scheduleRefresh();
  }

  async function preflightAssets() {
    assetsReady = false;
    assetsError = "";
    scheduleRefresh();
    try {
      if (!window.TallamMinistryPreviewRenderer?.generate) throw new Error("تعذر تحميل محرك الاستمارة المتزامنة. حدّث الصفحة ثم أعد المحاولة.");
      if (!window.TallamOfficialMinistryBackground) throw new Error("تعذر تحميل خلفية استمارة الوزارة الرسمية.");
      await assertReadableImage(window.TallamOfficialMinistryBackground, "خلفية استمارة الوزارة الرسمية", { minimumWidth: 1000, minimumHeight: 1400 });
      assetsReady = true;
    } catch (error) {
      assetsError = error?.message || "تعذر تجهيز قالب الاستمارة الرسمية.";
    }
    scheduleRefresh();
  }

  async function assertReadableImage(source, label, limits = {}) {
    const minimumWidth = limits.minimumWidth || 1, minimumHeight = limits.minimumHeight || 1;
    if (source instanceof Blob && typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(source);
        const width = bitmap.width, height = bitmap.height;
        bitmap.close?.();
        if (width < minimumWidth || height < minimumHeight) throw new Error(`${label} غير مكتملة أو أبعادها غير صالحة.`);
        return;
      } catch { /* use image element */ }
    }
    await new Promise((resolve, reject) => {
      const image = new Image();
      let objectUrl = "";
      const timer = window.setTimeout(() => finish(new Error(`استغرق التحقق من ${label} وقتًا طويلًا.`)), 20000);
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        error ? reject(error) : resolve();
      };
      image.onload = () => {
        const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
        finish(width < minimumWidth || height < minimumHeight ? new Error(`${label} غير مكتملة أو أبعادها غير صالحة.`) : null);
      };
      image.onerror = () => finish(new Error(`تعذر قراءة ${label}.`));
      try {
        if (source instanceof Blob) { objectUrl = URL.createObjectURL(source); image.src = objectUrl; }
        else image.src = String(source || "");
      } catch { finish(new Error(`تعذر قراءة ${label}.`)); }
    });
  }

  document.body.dataset.readinessBuild = BUILD;
})();
