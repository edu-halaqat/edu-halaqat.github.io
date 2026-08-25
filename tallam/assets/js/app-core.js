"use strict";

  const CONFIG = Object.freeze({
    endpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/submit-teacher-application",
    maxFileBytes: 8 * 1024 * 1024,
    maxTotalBytes: 40 * 1024 * 1024,
    timeoutMs: 180000,
    draftKey: "tallam_teacher_application_v3",
    formVersion: "3.0.0",
    exportVersion: "2.0.0"
  });

  const form = document.getElementById("teacherForm");
  const steps = [...document.querySelectorAll(".form-step")];
  const tabs = [...document.querySelectorAll(".step-tab")];
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");
  const progressFill = document.getElementById("progressFill");
  const statusBox = document.getElementById("formStatus");
  const reviewGrid = document.getElementById("reviewGrid");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingTitle = document.getElementById("loadingTitle");
  const loadingText = document.getElementById("loadingText");
  const successPanel = document.getElementById("successPanel");
  const formArea = document.getElementById("formArea");
  const referenceNumber = document.getElementById("referenceNumber");
  const canvas = document.getElementById("signatureCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const startedAt = new Date().toISOString();

  let stepIndex = 0;
  let drawing = false;
  let signatureDirty = false;
  let lastPoint = null;
  let generatedDocx = null;
  let generatedPdf = null;
  let generatedReference = "";
  let saveTimer = null;

  const requiredFileNames = [
    "educational_certificate", "cv", "recommendation_1", "recommendation_2",
    "quran_certificates", "identity_document", "iban_document"
  ];

  const summaryFields = [
    ["نوع الطلب", "registration_type"], ["الاسم الرباعي", "full_name"],
    ["رقم الهوية", "identity_number"], ["الجنسية", "nationality"],
    ["المؤهل", "qualification"], ["التخصص", "specialization"],
    ["الجوال", "mobile"], ["البريد", "email"],
    ["المسجد أو الجهة", "mosque"], ["مقدار الحفظ", "quran_memorization"],
    ["سنوات الخبرة", "experience_years"], ["البنك", "bank"]
  ];

  function setStep(index) {
    stepIndex = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach((step, i) => step.classList.toggle("active", i === stepIndex));
    tabs.forEach((tab, i) => {
      tab.classList.toggle("active", i === stepIndex);
      tab.classList.toggle("done", i < stepIndex);
    });
    progressFill.style.width = `${((stepIndex + 1) / steps.length) * 100}%`;
    prevBtn.disabled = stepIndex === 0;
    nextBtn.hidden = stepIndex === steps.length - 1;
    submitBtn.hidden = stepIndex !== steps.length - 1;
    hideStatus();
    if (stepIndex === steps.length - 1) buildReview();
    document.getElementById("application-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fieldValue(name) {
    const elements = form.elements[name];
    if (!elements) return "";
    if (typeof elements.length === "number" && !elements.tagName) {
      const checked = [...elements].find((el) => el.checked);
      return checked ? checked.value.trim() : "";
    }
    return String(elements.value || "").trim();
  }

  function normalizeDigits(value) {
    const ar = "٠١٢٣٤٥٦٧٨٩";
    const fa = "۰۱۲۳۴۵۶۷۸۹";
    return String(value || "")
      .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
      .replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  }

  function normalizedIdentity() {
    return normalizeDigits(fieldValue("identity_number")).replace(/\D/g, "");
  }

  function normalizedMobile() {
    let value = normalizeDigits(fieldValue("mobile")).replace(/\D/g, "");
    if (value.startsWith("966")) value = value.slice(3);
    if (value.startsWith("0")) value = value.slice(1);
    return value;
  }

  function normalizedIban() {
    return normalizeDigits(fieldValue("iban")).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function showStatus(message, type = "error") {
    statusBox.textContent = message;
    statusBox.className = `status show ${type}`;
    statusBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideStatus() {
    statusBox.textContent = "";
    statusBox.className = "status";
  }

  function markInvalid(element, invalid = true) {
    if (!element) return;
    element.classList.toggle("invalid", invalid);
    if (invalid) element.setAttribute("aria-invalid", "true");
    else element.removeAttribute("aria-invalid");
  }

  function validateFile(input, required) {
    if (!input) return true;
    const file = input.files?.[0];
    if (required && !file) {
      markInvalid(input, true);
      return false;
    }
    if (file && file.size > CONFIG.maxFileBytes) {
      markInvalid(input, true);
      showStatus(`حجم الملف «${input.closest(".file-card")?.querySelector("label")?.textContent.trim() || input.name}» يتجاوز 8 ميغابايت.`);
      return false;
    }
    markInvalid(input, false);
    return true;
  }

  function validateStep(index, focus = true) {
    let valid = true;
    let firstInvalid = null;
    const controls = [...steps[index].querySelectorAll("input,select,textarea")].filter((el) => !el.disabled && el.type !== "hidden");

    for (const element of controls) {
      if (element.type === "radio") {
        const group = form.querySelectorAll(`input[type=radio][name="${CSS.escape(element.name)}"]`);
        const groupValid = !element.required || [...group].some((item) => item.checked);
        if (!groupValid) {
          valid = false;
          firstInvalid ||= element;
        }
        continue;
      }
      if (element.type === "file") {
        const required = element.required || (element.name === "personal_photo" && fieldValue("gender") === "ذكر");
        const ok = validateFile(element, required);
        if (!ok) { valid = false; firstInvalid ||= element; }
        continue;
      }
      const ok = element.checkValidity();
      markInvalid(element, !ok);
      if (!ok) { valid = false; firstInvalid ||= element; }
    }

    if (index === 1) {
      const fullName = fieldValue("full_name").split(/\s+/).filter(Boolean);
      const identity = normalizedIdentity();
      const expiry = Date.parse(`${fieldValue("identity_expiry")}T23:59:59`);
      if (fullName.length < 4) { valid = false; firstInvalid ||= form.elements.full_name; markInvalid(form.elements.full_name, true); showStatus("يرجى كتابة الاسم الرباعي كاملًا."); }
      else if (!/^\d{10}$/.test(identity)) { valid = false; firstInvalid ||= form.elements.identity_number; markInvalid(form.elements.identity_number, true); showStatus("رقم الهوية أو الإقامة يجب أن يتكون من 10 أرقام."); }
      else if (!Number.isFinite(expiry) || expiry < Date.now()) { valid = false; firstInvalid ||= form.elements.identity_expiry; markInvalid(form.elements.identity_expiry, true); showStatus("تاريخ انتهاء الهوية غير صالح أو منتهٍ."); }
    }

    if (index === 3) {
      const mobile = normalizedMobile();
      if (!/^5\d{8}$/.test(mobile)) { valid = false; firstInvalid ||= form.elements.mobile; markInvalid(form.elements.mobile, true); showStatus("يرجى إدخال رقم جوال سعودي صحيح مثل 05xxxxxxxx."); }
    }

    if (index === 4) {
      const iban = normalizedIban();
      if (!/^SA\d{22}$/.test(iban)) { valid = false; firstInvalid ||= form.elements.iban; markInvalid(form.elements.iban, true); showStatus("رقم الآيبان السعودي يجب أن يبدأ بـ SA ويتبعه 22 رقمًا."); }
    }

    if (index === 6) {
      let total = 0;
      for (const input of steps[index].querySelectorAll('input[type="file"]')) total += input.files?.[0]?.size || 0;
      if (total > CONFIG.maxTotalBytes) { valid = false; showStatus("إجمالي حجم المرفقات يتجاوز 40 ميغابايت. يرجى ضغط الملفات."); }
    }

    if (index === 7 && !signatureDirty) {
      valid = false;
      showStatus("يرجى رسم التوقيع الإلكتروني قبل إرسال الطلب.");
    }

    if (!valid && focus && firstInvalid) {
      firstInvalid.focus({ preventScroll: true });
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!statusBox.classList.contains("show")) showStatus("يرجى إكمال الحقول المطلوبة بصورة صحيحة.");
    }
    return valid;
  }

  function validateAll() {
    for (let i = 0; i < steps.length; i += 1) {
      if (!validateStep(i, false)) {
        setStep(i);
        validateStep(i, true);
        return false;
      }
    }
    return true;
  }

  function buildReview() {
    reviewGrid.innerHTML = summaryFields.map(([label, name]) => {
      let value = fieldValue(name) || "—";
      if (name === "mobile") value = `0${normalizedMobile()}`;
      if (name === "identity_number") value = normalizedIdentity();
      return `<div class="review-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function initSignature() {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#102927";
    ctx.lineWidth = 3.4;

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      const source = event.touches?.[0] || event.changedTouches?.[0] || event;
      return { x: (source.clientX - rect.left) * (canvas.width / rect.width), y: (source.clientY - rect.top) * (canvas.height / rect.height) };
    };

    const start = (event) => { event.preventDefault(); drawing = true; lastPoint = point(event); };
    const move = (event) => {
      if (!drawing) return;
      event.preventDefault();
      const next = point(event);
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      lastPoint = next;
      signatureDirty = true;
    };
    const end = (event) => { if (drawing) event.preventDefault(); drawing = false; lastPoint = null; };

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end, { passive: false });

    document.getElementById("clearSignature").addEventListener("click", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      signatureDirty = false;
    });
  }

  function canvasToBlob(canvasElement) {
    return new Promise((resolve, reject) => canvasElement.toBlob((blob) => blob ? resolve(blob) : reject(new Error("تعذر إنشاء ملف التوقيع.")), "image/png", 0.95));
  }

  async function fileToDataUrl(file) {
    if (!file) return "";
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("تعذر قراءة الصورة الشخصية."));
      reader.readAsDataURL(file);
    });
  }

  function putText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value || "—";
  }

  async function populateMinistrySheet() {
    putText("mFullName", fieldValue("full_name"));
    putText("mIdentity", normalizedIdentity());
    putText("mIdentityType", fieldValue("identity_type"));
    putText("mIdentityExpiry", fieldValue("identity_expiry"));
    putText("mNationality", fieldValue("nationality"));
    putText("mGender", fieldValue("gender"));
    putText("mBirth", fieldValue("birth_place_date"));
    putText("mQualification", fieldValue("qualification"));
    putText("mSpecialization", fieldValue("specialization"));
    putText("mWorkplace", fieldValue("workplace"));
    putText("mJobTitle", fieldValue("job_title"));
    putText("mPhone", fieldValue("phone"));
    putText("mMobile", `0${normalizedMobile()}`);
    putText("mCity", fieldValue("city"));
    putText("mRegion", fieldValue("region"));
    putText("mDistrict", fieldValue("district"));
    putText("mStreet", fieldValue("street"));
    putText("mBuilding", fieldValue("building_number"));
    putText("mApartment", fieldValue("apartment_number"));
    putText("mTwitter", fieldValue("twitter"));
    putText("mFacebook", fieldValue("facebook"));
    putText("mEmail", fieldValue("email"));
    putText("mDeclarant", fieldValue("full_name"));
    document.getElementById("mSignature").src = canvas.toDataURL("image/png");

    const photoContainer = document.getElementById("mPhoto");
    const photo = form.elements.personal_photo.files?.[0];
    photoContainer.innerHTML = "<span>الصورة<br>الشخصية<br>للرجال فقط</span>";
    if (photo) {
      const image = document.createElement("img");
      image.src = await fileToDataUrl(photo);
      image.alt = "الصورة الشخصية";
      photoContainer.replaceChildren(image);
      await image.decode().catch(() => undefined);
    }
  }

  function exportHtmlDocument() {
    const sheet = document.getElementById("ministrySheet").cloneNode(true);
    const style = `
      @page { size: A4 portrait; margin: 8mm; }
      body { margin:0; font-family:Arial,Tahoma,sans-serif; direction:rtl; color:#111; }
      .ministry-sheet{width:100%;box-sizing:border-box;padding:8mm 5mm;font-family:Arial,Tahoma,sans-serif;direction:rtl;line-height:1.35}
      .ministry-head{display:table;width:100%;table-layout:fixed;min-height:150px}.ministry-head>div{display:table-cell;vertical-align:top;text-align:center}
      .ministry-photo{border:2px solid #111;width:105px;height:132px;text-align:center;vertical-align:middle!important;overflow:hidden}.ministry-photo img{width:100%;height:132px;object-fit:cover}
      .ministry-emblem svg{width:76px;height:92px}.ministry-emblem .vision{color:#999;font-size:14px}.ministry-copy{font-weight:bold;font-size:15px}.ministry-copy div{margin-bottom:14px}
      .ministry-title{text-align:center;font-size:20px;font-weight:bold;margin:8px 0 14px}.m-section{margin-top:12px}.m-section-title{width:34%;margin-right:auto;background:#c7dca0;border:1px solid #333;text-align:center;font-size:15px;font-weight:bold;padding:5px}
      .m-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}.m-table th,.m-table td{border:1px solid #333;padding:5px;text-align:center;height:26px;word-break:break-word}.m-table th,.m-social td:first-child{background:#e8f0db;font-weight:bold}.m-social td:first-child{width:34%}
      .m-declaration{color:red;font-size:13px;font-weight:bold;text-align:center;line-height:1.8;margin-top:16px}.m-signature{text-align:center;margin-top:6px}.m-signature img{width:140px;height:55px;object-fit:contain;border-bottom:1px solid #777;vertical-align:bottom}
    `;
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${style}</style></head><body>${sheet.outerHTML}</body></html>`;
  }

