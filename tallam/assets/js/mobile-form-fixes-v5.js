(() => {
  "use strict";

  const OPTIONAL_RECOMMENDATIONS = ["recommendation_1", "recommendation_2"];

  function getForm() {
    return document.getElementById("teacherForm");
  }

  function normalizeOptionalRecommendations() {
    const form = getForm();
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

  function installSignatureMobileFix() {
    const canvas = document.getElementById("signatureCanvas");
    if (!canvas || canvas.dataset.mobileSignatureFix === "v6") return;
    canvas.dataset.mobileSignatureFix = "v6";
    canvas.style.touchAction = "none";
    canvas.style.webkitUserSelect = "none";
    canvas.style.userSelect = "none";

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#102927";
    ctx.lineWidth = 3.4;

    let drawing = false;
    let last = null;

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / Math.max(rect.width, 1)),
        y: (event.clientY - rect.top) * (canvas.height / Math.max(rect.height, 1))
      };
    };

    const start = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drawing = true;
      last = point(event);
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    };

    const move = (event) => {
      if (!drawing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const next = point(event);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      last = next;
    };

    const end = (event) => {
      if (!drawing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drawing = false;
      last = null;
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
    };

    canvas.addEventListener("pointerdown", start, { capture: true, passive: false });
    canvas.addEventListener("pointermove", move, { capture: true, passive: false });
    canvas.addEventListener("pointerup", end, { capture: true, passive: false });
    canvas.addEventListener("pointercancel", end, { capture: true, passive: false });
    canvas.addEventListener("touchstart", (event) => event.stopImmediatePropagation(), { capture: true, passive: false });
    canvas.addEventListener("touchmove", (event) => event.stopImmediatePropagation(), { capture: true, passive: false });
    canvas.addEventListener("touchend", (event) => event.stopImmediatePropagation(), { capture: true, passive: false });
  }

  function installValidationFallback() {
    if (window.__TALLAM_VALIDATE_PATCH__) return;
    const form = getForm();
    if (!form || typeof window.validateAll !== "function") return;

    const original = window.validateAll;
    const steps = [...form.querySelectorAll(".form-step")];
    window.__TALLAM_VALIDATE_PATCH__ = true;
    window.__TALLAM_ORIGINAL_VALIDATE_ALL__ = original;

    window.validateAll = function patchedValidateAll() {
      for (let i = 0; i < steps.length - 1; i += 1) {
        if (!window.validateStep(i, false)) {
          window.setStep(i);
          window.validateStep(i, true);
          return false;
        }
      }

      if (!canvasHasInk()) {
        window.setStep(steps.length - 1);
        window.showStatus("يرجى رسم التوقيع الإلكتروني داخل مربع التوقيع قبل إرسال الطلب.");
        return false;
      }

      const finalStep = steps[steps.length - 1];
      for (const checkbox of finalStep.querySelectorAll('input[type="checkbox"][required]')) {
        if (!checkbox.checked) {
          window.markInvalid(checkbox, true);
          window.setStep(steps.length - 1);
          window.showStatus("يرجى الموافقة على التعهد وسياسة الخصوصية قبل إرسال الطلب.");
          checkbox.focus({ preventScroll: true });
          return false;
        }
      }
      return true;
    };
  }

  normalizeOptionalRecommendations();
  installSignatureMobileFix();
  installValidationFallback();

  const form = getForm();
  if (form) {
    new MutationObserver(() => {
      normalizeOptionalRecommendations();
      installSignatureMobileFix();
    }).observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ["required"] });
  }

  window.addEventListener("load", () => {
    normalizeOptionalRecommendations();
    installSignatureMobileFix();
  }, { once: true });
})();
