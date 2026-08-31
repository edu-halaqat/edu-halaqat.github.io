"use strict";

  const FILE_CACHE_BUILD = "20260831-stable-file-cache-v2";

  function fileInputLabel(input) {
    const direct = input?.id ? form.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    return String(direct?.textContent || input?.closest?.(".file-card")?.querySelector("label")?.textContent || input?.name || "الملف")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function friendlySubmissionError(error, label = "أحد المرفقات") {
    const cache = window.TallamFileCache;
    if (cache?.friendlyError) return cache.friendlyError(error, label);
    const name = String(error?.name || "");
    const message = String(error?.message || error || "");
    if (/NotReadableError|SecurityError/i.test(name)
      || /requested file could not be read|permission problems|permission denied|file could not be read/i.test(message)) {
      return `انتهت صلاحية الوصول إلى ${label} في الهاتف. أعد اختيار الملف من تطبيق «ملفاتي» أو «الصور» ثم أرسل الطلب دون إغلاق الصفحة.`;
    }
    return message || "حدث خطأ غير متوقع أثناء إرسال الطلب.";
  }

  async function stabilizeSelectedFiles() {
    if (!window.TallamFileCache?.captureAll) return new Map();
    return window.TallamFileCache.captureAll(form);
  }

  async function stableInputFile(input) {
    const source = input?.files?.[0] || null;
    if (!source) return null;
    if (!window.TallamFileCache?.getInputFile) return source;
    try {
      return await window.TallamFileCache.getInputFile(input);
    } catch (error) {
      throw new Error(friendlySubmissionError(error, `«${fileInputLabel(input)}»`));
    }
  }

  async function generateExports() {
    if (!window.TallamMinistryExporter || !window.JSZip) {
      throw new Error("تعذر تحميل القالب الرسمي وأدوات إصدار الملفات. تحقق من اتصال الإنترنت ثم أعد المحاولة.");
    }
    await stabilizeSelectedFiles();
    const signatureBlob = await canvasToBlob(canvas);
    const values = {
      full_name: fieldValue("full_name"),
      identity_number: normalizedIdentity(),
      identity_type: fieldValue("identity_type"),
      identity_expiry: fieldValue("identity_expiry"),
      nationality: fieldValue("nationality"),
      gender: fieldValue("gender"),
      birth_place_date: fieldValue("birth_place_date"),
      qualification: fieldValue("qualification"),
      specialization: fieldValue("specialization"),
      workplace: fieldValue("workplace"),
      job_title: fieldValue("job_title"),
      phone: fieldValue("phone"),
      mobile: normalizedMobile(),
      city: fieldValue("city"),
      region: fieldValue("region"),
      district: fieldValue("district"),
      street: fieldValue("street"),
      building_number: fieldValue("building_number"),
      apartment_number: fieldValue("apartment_number"),
      twitter: fieldValue("twitter"),
      facebook: fieldValue("facebook"),
      email: fieldValue("email")
    };
    const photoInput = form.elements.personal_photo;
    const photoFile = await stableInputFile(photoInput);
    return window.TallamMinistryExporter.generate({ values, photoFile, signatureBlob });
  }

  function appendText(data, name, value, fallback = "") {
    const normalized = String(value ?? "").trim() || fallback;
    data.append(name, normalized);
  }

  async function buildPayload(exports) {
    const data = new FormData();
    const textNames = [
      "registration_type", "branch", "full_name", "identity_type", "identity_expiry", "nationality", "gender", "birth_place_date",
      "qualification", "specialization", "workplace", "job_title", "mosque", "period", "circle_type", "phone", "city", "region",
      "district", "street", "building_number", "apartment_number", "twitter", "facebook", "email", "bank", "account_holder",
      "quran_memorization", "has_sanad", "has_madaniyah", "has_nooraniyah", "experience_years", "reading_narration", "previous_entities"
    ];
    for (const name of textNames) {
      appendText(data, name, fieldValue(name), ["phone", "apartment_number", "twitter", "facebook", "workplace", "job_title", "previous_entities"].includes(name) ? "لا يوجد" : "");
    }
    appendText(data, "identity_number", normalizedIdentity());
    appendText(data, "mobile", normalizedMobile());
    appendText(data, "iban", normalizedIban());
    appendText(data, "declaration_accepted", "true");
    appendText(data, "privacy_accepted", "true");
    appendText(data, "started_at", startedAt);
    appendText(data, "form_version", CONFIG.formVersion);
    appendText(data, "ministry_export_version", `3.1.0-official-template-${FILE_CACHE_BUILD}`);
    appendText(data, "client_timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh");
    appendText(data, "website", fieldValue("website"));

    for (const input of form.querySelectorAll('input[type="file"]')) {
      const source = input.files?.[0];
      if (!source) continue;
      const stable = await stableInputFile(input);
      if (!stable) continue;
      data.append(input.name, stable, stable.name || source.name || `${input.name}.bin`);
    }

    data.append("signature", exports.signatureBlob, "signature.png");
    data.append("ministry_form_docx", exports.docxBlob, "ministry-teacher-form.docx");
    data.append("ministry_form_pdf", exports.pdfBlob, "ministry-teacher-form.pdf");
    return data;
  }

  async function submitPayload(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      const response = await fetch(CONFIG.endpoint, {
        method: "POST", body: payload, signal: controller.signal,
        headers: { "x-client-info": `tallam-teachers-web/5-${FILE_CACHE_BUILD}` }
      });
      let result = {};
      try { result = await response.json(); } catch { result = {}; }
      if (!response.ok) throw new Error(result.message || `تعذر حفظ الطلب (رمز ${response.status}).`);
      if (!result.reference_number) throw new Error("حُفظ الطلب لكن لم يصل الرقم المرجعي. يرجى التواصل مع الجمعية.");
      return result;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("استغرق الإرسال وقتًا أطول من المعتاد. تحقق من الاتصال ثم أعد المحاولة.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function safeName(value) {
    return String(value || "teacher").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 70) || "teacher";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function downloadBoth() {
    if (!generatedDocx || !generatedPdf) return;
    const zip = new window.JSZip();
    const base = `${safeName(fieldValue("full_name"))}-${generatedReference}`;
    zip.file(`${base}.docx`, generatedDocx);
    zip.file(`${base}.pdf`, generatedPdf);
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    downloadBlob(blob, `${base}-Word-PDF.zip`);
  }

  function showLoading(title, text) {
    loadingTitle.textContent = title;
    loadingText.textContent = text;
    loadingOverlay.classList.add("show");
  }

  function hideLoading() {
    loadingOverlay.classList.remove("show");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    hideStatus();
    if (!validateAll()) return;

    submitBtn.disabled = true;
    prevBtn.disabled = true;
    showLoading("جارٍ تثبيت المرفقات", "يتم حفظ نسخة آمنة من الملفات المختارة داخل الصفحة قبل تعبئة الاستمارة وإرسال الطلب.");

    try {
      await stabilizeSelectedFiles();
      loadingTitle.textContent = "جارٍ تعبئة الاستمارة الرسمية";
      loadingText.textContent = "يتم إدخال البيانات في القالب الأصلي دون تغيير شعاراته أو تنسيقه.";
      const exports = await generateExports();
      loadingTitle.textContent = "جارٍ حفظ الطلب";
      loadingText.textContent = "يتم رفع البيانات والمرفقات ونسختي Word وPDF بصورة آمنة؛ يرجى عدم إغلاق الصفحة.";
      const payload = await buildPayload(exports);
      const result = await submitPayload(payload);

      generatedDocx = exports.docxBlob;
      generatedPdf = exports.pdfBlob;
      generatedReference = result.reference_number;
      referenceNumber.textContent = generatedReference;
      formArea.hidden = true;
      successPanel.classList.add("show");
      localStorage.removeItem(CONFIG.draftKey);
      window.scrollTo({ top: document.getElementById("application-form").offsetTop - 80, behavior: "smooth" });

      try { await downloadBoth(); } catch (downloadError) { console.warn(downloadError); }
    } catch (error) {
      console.error(error);
      showStatus(friendlySubmissionError(error));
    } finally {
      hideLoading();
      submitBtn.disabled = true;
      prevBtn.disabled = stepIndex === 0;
      requestAnimationFrame(() => form.dispatchEvent(new Event("input", { bubbles: true })));
    }
  }

  function saveDraft() {
    const data = {};
    for (const element of form.elements) {
      if (!element.name || ["file", "submit", "button"].includes(element.type) || element.name === "website") continue;
      if (element.type === "radio" || element.type === "checkbox") {
        if (element.checked) data[element.name] = element.value || true;
      } else data[element.name] = element.value;
    }
    try { localStorage.setItem(CONFIG.draftKey, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* ignored */ }
  }

  function scheduleDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 500);
  }

  function restoreDraft() {
    try {
      const stored = JSON.parse(localStorage.getItem(CONFIG.draftKey) || "null");
      if (!stored?.data || Date.now() - stored.savedAt > 7 * 24 * 60 * 60 * 1000) return;
      for (const [name, value] of Object.entries(stored.data)) {
        const elements = form.elements[name];
        if (!elements) continue;
        if (typeof elements.length === "number" && !elements.tagName) {
          const target = [...elements].find((item) => item.value === value);
          if (target) target.checked = true;
        } else if (elements.type === "checkbox") elements.checked = Boolean(value);
        else elements.value = value;
      }
      showStatus("استُعيدت المسودة المحفوظة على هذا الجهاز. يرجى مراجعة البيانات والمرفقات.", "info");
    } catch { localStorage.removeItem(CONFIG.draftKey); }
  }

  nextBtn.addEventListener("click", () => { if (validateStep(stepIndex)) setStep(stepIndex + 1); });
  prevBtn.addEventListener("click", () => setStep(stepIndex - 1));
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("input", scheduleDraft);
  form.addEventListener("change", scheduleDraft);
  form.addEventListener("input", (event) => markInvalid(event.target, false));

  document.getElementById("downloadWord").addEventListener("click", () => {
    if (generatedDocx) downloadBlob(generatedDocx, `${safeName(fieldValue("full_name"))}-${generatedReference}.docx`);
  });
  document.getElementById("downloadPdf").addEventListener("click", () => {
    if (generatedPdf) downloadBlob(generatedPdf, `${safeName(fieldValue("full_name"))}-${generatedReference}.pdf`);
  });
  document.getElementById("downloadZip").addEventListener("click", downloadBoth);

  for (const input of form.querySelectorAll('input[type="file"]')) {
    input.addEventListener("change", () => {
      const card = input.closest(".file-card");
      const list = card?.querySelector(".file-list");
      const file = input.files?.[0];
      if (list && file) list.textContent = `${file.name} ـ ${(file.size / 1024 / 1024).toFixed(2)} ميغابايت`;
      validateFile(input, input.required || (input.name === "personal_photo" && fieldValue("gender") === "ذكر"));
    });
  }

  restoreDraft();
  initSignature();
  setStep(0);
