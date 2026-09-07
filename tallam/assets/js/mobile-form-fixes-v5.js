(() => {
  "use strict";

  const OPTIONAL_RECOMMENDATIONS = ["recommendation_1", "recommendation_2"];

  function normalizeOptionalRecommendations() {
    const form = document.getElementById("teacherForm");
    if (!form) return;
    for (const name of OPTIONAL_RECOMMENDATIONS) {
      const input = form.elements[name];
      if (!input) continue;
      input.required = false;
      input.removeAttribute("required");
      input.setCustomValidity("");
      const label = input.closest(".file-card")?.querySelector("label");
      if (label && !label.textContent.includes("اختياري")) {
        const note = document.createElement("small");
        note.textContent = " (اختياري)";
        label.append(note);
      }
    }
  }

  function canvasHasInk() {
    const canvas = document.getElementById("signatureCanvas");
    if (!canvas) return false;
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 12) return true;
      }
    } catch (_) {}
    return false;
  }

  function installValidationFallback() {
    if (typeof window.validateAll !== "function" || window.__TALLAM_VALIDATE_PATCH__) return;
    const original = window.validateAll;
    window.__TALLAM_VALIDATE_PATCH__ = true;
    window.validateAll = function patchedValidateAll() {
      for (let i = 0; i < steps.length - 1; i += 1) {
        if (!validateStep(i, false)) {
          setStep(i);
          validateStep(i, true);
          return false;
        }
      }

      if (!canvasHasInk()) {
        setStep(steps.length - 1);
        showStatus("يرجى رسم التوقيع الإلكتروني داخل مربع التوقيع قبل إرسال الطلب.");
        return false;
      }

      const finalStep = steps[steps.length - 1];
      for (const checkbox of finalStep.querySelectorAll('input[type="checkbox"][required]')) {
        if (!checkbox.checked) {
          markInvalid(checkbox, true);
          setStep(steps.length - 1);
          showStatus("يرجى الموافقة على التعهد وسياسة الخصوصية قبل إرسال الطلب.");
          checkbox.focus({ preventScroll: true });
          return false;
        }
      }
      return true;
    };
    window.__TALLAM_ORIGINAL_VALIDATE_ALL__ = original;
  }

  normalizeOptionalRecommendations();
  installValidationFallback();
  const form = document.getElementById("teacherForm");
  if (form) {
    new MutationObserver(normalizeOptionalRecommendations).observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ["required"] });
  }
  window.addEventListener("load", normalizeOptionalRecommendations, { once: true });
})();
