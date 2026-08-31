(() => {
  "use strict";

  const COMPAT_BUILD = "20260831-stable-file-cache-v2";
  const PHOTO_ERROR = "تعذر تجهيز الصورة الشخصية. أعد اختيار الصورة من تطبيق «الصور» أو «ملفاتي» ثم حاول مجددًا.";
  const decodeCache = new WeakMap();
  const normalizedCache = new WeakMap();

  const exporter = window.TallamMinistryExporter;
  if (!exporter?.generate || exporter.__mobilePhotoCompatibility) return;

  function withTimeout(promise, milliseconds, message) {
    let timer = 0;
    const timeout = new Promise((_resolve, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  async function stableSource(source) {
    if (!(source instanceof Blob) || !source.size) return source;
    if (!window.TallamFileCache?.getStableFile) return source;
    try {
      return await window.TallamFileCache.getStableFile(source, "الصورة الشخصية");
    } catch (error) {
      const message = window.TallamFileCache.friendlyError?.(error, "الصورة الشخصية") || PHOTO_ERROR;
      throw new Error(message);
    }
  }

  async function detectImageType(blob) {
    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
      return "image/png";
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    return "";
  }

  function loadHtmlImage(blob) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(blob);
      let settled = false;
      const timer = window.setTimeout(() => finish(new Error(PHOTO_ERROR)), 25000);

      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error) {
          URL.revokeObjectURL(objectUrl);
          reject(error);
          return;
        }
        resolve({ image, release: () => URL.revokeObjectURL(objectUrl) });
      };

      image.onload = () => finish();
      image.onerror = () => finish(new Error(PHOTO_ERROR));
      image.decoding = "sync";
      image.src = objectUrl;
    });
  }

  async function decodeToStableCanvas(source) {
    const file = await stableSource(source);
    if (decodeCache.has(file)) return decodeCache.get(file);

    const task = (async () => {
      const detectedType = await detectImageType(file);
      if (!detectedType) throw new Error("الصورة الشخصية ليست ملف JPG أو PNG صحيحًا.");

      const blob = file.type === detectedType ? file : new Blob([await file.arrayBuffer()], { type: detectedType });
      let drawable = null;
      let release = () => {};

      if (typeof createImageBitmap === "function") {
        try {
          drawable = await withTimeout(
            createImageBitmap(blob, { imageOrientation: "from-image", premultiplyAlpha: "default", colorSpaceConversion: "default" }),
            25000,
            PHOTO_ERROR
          );
        } catch (_firstError) {
          try {
            drawable = await withTimeout(createImageBitmap(blob), 25000, PHOTO_ERROR);
          } catch (_secondError) {
            drawable = null;
          }
        }
      }

      if (!drawable) {
        const loaded = await loadHtmlImage(blob);
        drawable = loaded.image;
        release = loaded.release;
      }

      try {
        const sourceWidth = Number(drawable.naturalWidth || drawable.width || 0);
        const sourceHeight = Number(drawable.naturalHeight || drawable.height || 0);
        if (!sourceWidth || !sourceHeight) throw new Error(PHOTO_ERROR);

        const maximumDimension = 1800;
        const maximumPixels = 3200000;
        const scale = Math.min(
          1,
          maximumDimension / Math.max(sourceWidth, sourceHeight),
          Math.sqrt(maximumPixels / (sourceWidth * sourceHeight))
        );
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
        if (!context) throw new Error(PHOTO_ERROR);

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(drawable, 0, 0, width, height);
        context.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1);
        return canvas;
      } finally {
        release();
        if (typeof drawable?.close === "function") drawable.close();
      }
    })();

    decodeCache.set(file, task);
    task.catch(() => decodeCache.delete(file));
    return task;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.size < 512) {
          reject(new Error(PHOTO_ERROR));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  async function normalizePhoto(source, compact = false) {
    const stable = await stableSource(source);
    const cacheKey = compact ? "compact" : "standard";
    let cache = normalizedCache.get(stable);
    if (cache?.[cacheKey]) return cache[cacheKey];
    if (!cache) {
      cache = {};
      normalizedCache.set(stable, cache);
    }

    const task = (async () => {
      const sourceCanvas = await decodeToStableCanvas(stable);
      const maximumDimension = compact ? 720 : 1200;
      const scale = Math.min(1, maximumDimension / Math.max(sourceCanvas.width, sourceCanvas.height));
      const width = Math.max(1, Math.round(sourceCanvas.width * scale));
      const height = Math.max(1, Math.round(sourceCanvas.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error(PHOTO_ERROR);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(sourceCanvas, 0, 0, width, height);
      const jpeg = await canvasToBlob(canvas, "image/jpeg", compact ? 0.84 : 0.91);
      try {
        const normalized = new File([jpeg], "personal-photo-normalized.jpg", {
          type: "image/jpeg",
          lastModified: Date.now()
        });
        try { Object.defineProperty(normalized, "__tallamStableFile", { value: true }); } catch (_error) { /* ignored */ }
        return normalized;
      } catch (_error) {
        return new Blob([jpeg], { type: "image/jpeg" });
      }
    })();

    cache[cacheKey] = task;
    task.catch(() => {
      if (cache[cacheKey] === task) delete cache[cacheKey];
    });
    return task;
  }

  window.TallamMinistryExporter = Object.freeze({
    ...exporter,
    __mobilePhotoCompatibility: true,
    photoCompatibilityBuild: COMPAT_BUILD,
    async generate(options = {}) {
      const originalPhoto = options.photoFile;
      if (!(originalPhoto instanceof Blob) || !originalPhoto.size) return exporter.generate(options);

      const standardPhoto = await normalizePhoto(originalPhoto, false);
      try {
        return await exporter.generate({ ...options, photoFile: standardPhoto });
      } catch (error) {
        const message = String(error?.message || "");
        if (!message.includes("الصورة الشخصية") && !message.includes("صور الاستمارة")) throw error;
        const compactPhoto = await normalizePhoto(originalPhoto, true);
        return exporter.generate({ ...options, photoFile: compactPhoto });
      }
    }
  });

  const photoInput = document.getElementById("personal_photo");
  photoInput?.addEventListener("change", () => {
    void (async () => {
      const stable = await window.TallamFileCache?.getInputFile?.(photoInput);
      if (stable) await normalizePhoto(stable, false);
    })().catch(() => {});
  }, { passive: true });

  document.body.dataset.photoCompatibilityReady = "true";
})();
