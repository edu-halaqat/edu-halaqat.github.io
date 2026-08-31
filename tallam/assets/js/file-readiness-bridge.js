(() => {
  "use strict";

  const BRIDGE_BUILD = "20260831-file-reference-v3";
  const form = document.getElementById("teacherForm");
  const submitBtn = document.getElementById("submitBtn");
  const statusBox = document.getElementById("formStatus");
  const readinessBox = document.getElementById("submissionReadiness");
  const cache = window.TallamFileCache;
  let applying = false;
  let scheduled = 0;

  if (!form || !submitBtn || !cache?.stateOf) {
    document.body.dataset.fileReadinessBridge = "false";
    return;
  }

  function labelFor(input) {
    const direct = input.id ? form.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    return String(direct?.textContent || input.closest(".file-card")?.querySelector("label")?.textContent || input.name || "الملف")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function selectedFileStates() {
    return [...form.querySelectorAll('input[type="file"]')]
      .filter((input) => input.files?.[0])
      .map((input) => ({ input, label: labelFor(input), ...cache.stateOf(input) }));
  }

  function cacheProblem() {
    const states = selectedFileStates();
    const failed = states.find((item) => item.state === "error");
    if (failed) {
      return {
        blocking: true,
        error: true,
        message: failed.error || `تعذر تثبيت «${failed.label}». أعد اختيار الملف من ذاكرة الجهاز.`
      };
    }
    const pending = states.filter((item) => !["ready", "empty"].includes(item.state));
    if (pending.length) {
      const visible = pending.slice(0, 2).map((item) => `«${item.label}»`).join(" و");
      const remaining = pending.length > 2 ? ` و${pending.length - 2} ملفات أخرى` : "";
      return {
        blocking: true,
        error: false,
        message: `جارٍ تثبيت ${visible}${remaining} داخل الصفحة؛ انتظر لحظات حتى تكتمل العملية.`
      };
    }
    return { blocking: false, error: false, message: "" };
  }

  function lastStepVisible() {
    const steps = [...form.querySelectorAll(".form-step")];
    return Boolean(steps.at(-1)?.classList.contains("active"));
  }

  function showCacheMessage(problem) {
    if (!lastStepVisible() || !readinessBox) return;
    readinessBox.hidden = false;
    readinessBox.classList.add("show");
    readinessBox.classList.toggle("ready", false);
    readinessBox.classList.toggle("error", problem.error);
    readinessBox.textContent = problem.message;
  }

  function apply() {
    if (applying) return;
    applying = true;
    try {
      const problem = cacheProblem();
      submitBtn.dataset.fileCacheBlocked = problem.blocking ? "true" : "false";
      if (problem.blocking) {
        submitBtn.disabled = true;
        submitBtn.setAttribute("aria-disabled", "true");
        submitBtn.title = problem.message;
        showCacheMessage(problem);
      }
    } finally {
      applying = false;
    }
  }

  function schedule() {
    cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => {
      apply();
      if (!cacheProblem().blocking) {
        form.dispatchEvent(new CustomEvent("tallam:file-cache-ready", { bubbles: true }));
      }
    });
  }

  form.addEventListener("tallam:file-cache-state", schedule, true);
  form.addEventListener("input", schedule, true);
  form.addEventListener("change", schedule, true);
  form.addEventListener("tallam:file-cache-ready", () => requestAnimationFrame(apply), true);

  form.addEventListener("submit", (event) => {
    const problem = cacheProblem();
    if (!problem.blocking) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    submitBtn.disabled = true;
    showCacheMessage(problem);
    if (statusBox) {
      statusBox.textContent = problem.message;
      statusBox.className = `status show ${problem.error ? "error" : "info"}`;
      statusBox.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, true);

  const observer = new MutationObserver(apply);
  observer.observe(submitBtn, { attributes: true, attributeFilter: ["disabled", "hidden"] });

  document.body.dataset.fileReadinessBridge = "true";
  document.body.dataset.fileReadinessBuild = BRIDGE_BUILD;
  schedule();
})();
