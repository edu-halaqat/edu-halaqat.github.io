(() => {
  "use strict";

  const CACHE_BUILD = "20260831-stable-file-cache-v2";
  const CAPTURE_TIMEOUT_MS = 90000;
  const form = document.getElementById("teacherForm");
  const inputRecords = new WeakMap();
  const fileRecords = new WeakMap();

  const permissionPattern = /(requested file could not be read|file could not be read|could not be read|permission problems|permission denied|notreadableerror|securityerror|the object is in an invalid state)/i;

  function labelForInput(input) {
    const direct = input?.id ? form?.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    const nested = input?.closest?.(".field,.file-card")?.querySelector("label");
    return String(direct?.textContent || nested?.textContent || input?.name || "الملف")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function friendlyError(error, label = "الملف") {
    const name = String(error?.name || "");
    const message = String(error?.message || error || "").trim();
    if (permissionPattern.test(`${name} ${message}`)) {
      return new Error(`انتهت صلاحية الوصول إلى «${label}» في الهاتف قبل حفظه داخل الصفحة. أعد اختيار الملف من تطبيق «ملفاتي» أو «الصور»، وانتظر ظهور عبارة «تم تثبيت الملف»، ثم أرسل الطلب دون إغلاق الصفحة.`);
    }
    if (name === "AbortError" || /timeout|timed out|مهلة/i.test(message)) {
      return new Error(`استغرق تثبيت «${label}» وقتًا طويلًا. أعد اختيار الملف وتأكد من بقائه متاحًا على الجهاز.`);
    }
    if (message && /تعذر|انتهت|استغرق/.test(message)) return new Error(message);
    return new Error(`تعذر قراءة «${label}». أعد اختيار الملف من ذاكرة الجهاز ثم حاول مجددًا.`);
  }

  function withTimeout(promise, milliseconds, label) {
    let timer = 0;
    const timeout = new Promise((_resolve, reject) => {
      timer = window.setTimeout(() => reject(new DOMException(`Timed out while reading ${label}`, "AbortError")), milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  function readWithFileReader(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new DOMException("The requested file could not be read.", "NotReadableError"));
      reader.onabort = () => reject(new DOMException("File reading was aborted.", "AbortError"));
      reader.readAsArrayBuffer(blob);
    });
  }

  async function readBytes(source, label) {
    const strategies = [];
    if (typeof source?.arrayBuffer === "function") strategies.push(() => source.arrayBuffer());
    if (typeof FileReader === "function") strategies.push(() => readWithFileReader(source));
    if (typeof Response === "function") strategies.push(() => new Response(source).arrayBuffer());

    let lastError = null;
    for (const strategy of strategies) {
      try {
        const pending = strategy();
        const buffer = await withTimeout(Promise.resolve(pending), CAPTURE_TIMEOUT_MS, label);
        const bytes = new Uint8Array(buffer);
        if (source.size && bytes.byteLength !== source.size) {
          throw new DOMException("The requested file could not be read completely.", "NotReadableError");
        }
        return bytes;
      } catch (error) {
        lastError = error;
      }
    }
    throw friendlyError(lastError, label);
  }

  function sniffMime(bytes, fallback = "") {
    if (bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return fallback || "application/zip";
    }
    return fallback || "application/octet-stream";
  }

  function safeName(name) {
    const cleaned = String(name || "file")
      .replace(/[\\/\u0000-\u001f\u007f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
    return cleaned || "file";
  }

  function createStableFile(bytes, source) {
    const copy = bytes.slice();
    const name = safeName(source?.name);
    const type = sniffMime(copy, String(source?.type || "").toLowerCase());
    const lastModified = Number(source?.lastModified || Date.now());
    try {
      const stable = new File([copy], name, { type, lastModified });
      try { Object.defineProperty(stable, "__tallamStableFile", { value: true }); } catch (_error) { /* ignored */ }
      return stable;
    } catch (_error) {
      const stable = new Blob([copy], { type });
      try {
        Object.defineProperties(stable, {
          name: { value: name },
          lastModified: { value: lastModified },
          __tallamStableFile: { value: true }
        });
      } catch (_defineError) { /* ignored */ }
      return stable;
    }
  }

  function replaceInputWithStableFile(input, original, stable) {
    if (!(stable instanceof File) || typeof DataTransfer !== "function") return stable;
    if (input?.files?.[0] !== original) return stable;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(stable);
      input.files = transfer.files;
      const installed = input.files?.[0] || stable;
      try { Object.defineProperty(installed, "__tallamStableFile", { value: true }); } catch (_error) { /* ignored */ }
      fileRecords.set(installed, Promise.resolve(installed));
      return installed;
    } catch (_error) {
      return stable;
    }
  }

  function setVisualState(input, state, text = "") {
    if (!input) return;
    input.dataset.fileCacheState = state;
    const card = input.closest?.(".file-card");
    if (!card) return;
    let status = card.querySelector(".file-cache-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "file-cache-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      card.append(status);
    }
    status.dataset.state = state;
    status.textContent = text;
  }

  function dispatchState(input, state, error = null) {
    form?.dispatchEvent(new CustomEvent("tallam:file-cache-state", {
      bubbles: true,
      detail: { name: input?.name || "", state, error: error ? String(error.message || error) : "" }
    }));
  }

  function getRecord(input) {
    const source = input?.files?.[0] || null;
    const record = inputRecords.get(input);
    return source && record?.source === source ? record : null;
  }

  function captureFile(source, label = "الملف") {
    if (!(source instanceof Blob) || !source.size) return Promise.resolve(null);
    if (source.__tallamStableFile) return Promise.resolve(source);
    if (fileRecords.has(source)) return fileRecords.get(source);

    const task = (async () => {
      try {
        const bytes = await readBytes(source, label);
        const stable = createStableFile(bytes, source);
        const probe = new Uint8Array(await stable.slice(0, Math.min(stable.size, 64)).arrayBuffer());
        if (stable.size && !probe.length) throw new DOMException("Stable copy is empty.", "NotReadableError");
        return stable;
      } catch (error) {
        throw friendlyError(error, label);
      }
    })();

    fileRecords.set(source, task);
    task.catch(() => fileRecords.delete(source));
    return task;
  }

  function captureInput(input) {
    const source = input?.files?.[0] || null;
    if (!source) {
      inputRecords.delete(input);
      setVisualState(input, "empty", "");
      dispatchState(input, "empty");
      return Promise.resolve(null);
    }

    const existing = getRecord(input);
    if (existing) return existing.promise;

    const label = labelForInput(input);
    const record = { source, state: "capturing", stable: null, error: null, promise: null };
    setVisualState(input, "capturing", "جارٍ تثبيت الملف داخل الصفحة…");
    dispatchState(input, "capturing");

    record.promise = captureFile(source, label)
      .then((stable) => {
        const current = inputRecords.get(input);
        if (current !== record) return stable;
        const installed = replaceInputWithStableFile(input, source, stable);
        record.source = input.files?.[0] || source;
        record.state = "ready";
        record.stable = installed;
        setVisualState(input, "ready", "تم تثبيت الملف، ولن يتأثر بانتهاء صلاحية الوصول في الهاتف.");
        dispatchState(input, "ready");
        if (installed !== source) {
          window.setTimeout(() => input.dispatchEvent(new Event("change", { bubbles: true })), 0);
        }
        return installed;
      })
      .catch((error) => {
        const friendly = friendlyError(error, label);
        const current = inputRecords.get(input);
        if (current === record) {
          record.state = "error";
          record.error = friendly;
          setVisualState(input, "error", friendly.message);
          dispatchState(input, "error", friendly);
        }
        throw friendly;
      });

    inputRecords.set(input, record);
    record.promise.catch(() => {});
    return record.promise;
  }

  function resolveInput(inputOrName) {
    if (inputOrName?.tagName === "INPUT" && inputOrName.type === "file") return inputOrName;
    if (typeof inputOrName === "string") return form?.elements?.[inputOrName] || null;
    return null;
  }

  async function getInputFile(inputOrName) {
    const input = resolveInput(inputOrName);
    if (!input) return null;
    const source = input.files?.[0] || null;
    if (!source) return null;
    const record = getRecord(input);
    if (record?.stable) return record.stable;
    return captureInput(input);
  }

  async function captureAll(root = form) {
    const inputs = [...(root?.querySelectorAll?.('input[type="file"]') || [])]
      .filter((input) => input.files?.[0]);
    const output = new Map();
    for (const input of inputs) {
      const stable = await getInputFile(input);
      if (stable) output.set(input.name, stable);
    }
    return output;
  }

  function stateOf(inputOrName) {
    const input = resolveInput(inputOrName);
    if (!input?.files?.[0]) return { state: "empty", error: "" };
    const record = getRecord(input);
    return {
      state: record?.state || "pending",
      error: String(record?.error?.message || "")
    };
  }

  function installStyles() {
    if (document.getElementById("tallam-file-cache-styles")) return;
    const style = document.createElement("style");
    style.id = "tallam-file-cache-styles";
    style.textContent = `
      .file-cache-status{margin-top:8px;font-size:.78rem;line-height:1.55;color:#536b68}
      .file-cache-status[data-state="capturing"]{color:#7a5b23}
      .file-cache-status[data-state="ready"]{color:#087a55}
      .file-cache-status[data-state="error"]{color:#b42318;font-weight:700}
    `;
    document.head.append(style);
  }

  if (!form) {
    document.body.dataset.fileCacheReady = "false";
    return;
  }

  installStyles();
  form.addEventListener("change", (event) => {
    const input = event.target;
    if (input?.tagName === "INPUT" && input.type === "file") void captureInput(input);
  }, true);

  form.querySelectorAll('input[type="file"]').forEach((input) => {
    if (input.files?.[0]) void captureInput(input);
  });

  window.TallamFileCache = Object.freeze({
    build: CACHE_BUILD,
    captureInput,
    captureFile,
    captureAll,
    getInputFile,
    getStableFile: captureFile,
    stateOf,
    friendlyError(error, label) { return friendlyError(error, label).message; }
  });
  document.body.dataset.fileCacheReady = "true";
})();
