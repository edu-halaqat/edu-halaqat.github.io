(() => {
  "use strict";

  const COMPAT_BUILD = "20260831-mobile-photo-v1";
  const PHOTO_ERROR = "تعذر تجهيز الصورة الشخصية. أعد اختيار الصورة ثم حاول مجددًا.";
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
      const timer = window.setTimeout(() => finish(new Error(PHOTO_ERROR)), 20000);

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

  async function decodeToStableCanvas(file) {
    if (decodeCache.has(file)) return decodeCache.get(file);

    const task = (async () => {
      const detectedType = await detectImageType(file);
      if (!detectedType) {
        throw new Error("الصورة الشخصية ليست ملف JPG أو PNG صحيحًا.");
      }

      const blob = file.type === detectedType ? file : new Blob([file], { type: detectedType });
      let drawable = null;
      let release = () => {};

      if (typeof createImageBitmap === "function") {
        try {
          drawable = await withTimeout(
            createImageBitmap(blob, { imageOrientation: "from-image", premultiplyAlpha: "default", colorSpaceConversion: "default" }),
            20000,
            PHOTO_ERROR
          );
        } catch (_firstError) {
          try {
            drawable = await withTimeout(createImageBitmap(blob), 20000, PHOTO_ERROR);
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

        const maximumDimension = 1600;
        const maximumPixels = 2600000;
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
        const context = canvas.getContext("2d", { alpha: false });
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

  async function normalizePhoto(file, compact = false) {
    const cacheKey = compact ? "compact" : "standard";
    let cache = normalizedCache.get(file);
    if (cache?.[cacheKey]) return cache[cacheKey];
    if (!cache) {
      cache = {};
      normalizedCache.set(file, cache);
    }

    const task = (async () => {
      const source = await decodeToStableCanvas(file);
      const maximumDimension = compact ? 720 : 1200;
      const scale = Math.min(1, maximumDimension / Math.max(source.width, source.height));
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error(PHOTO_ERROR);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);
      const jpeg = await canvasToBlob(canvas, "image/jpeg", compact ? 0.86 : 0.92);
      try {
        return new File([jpeg], "personal-photo-normalized.jpg", {
          type: "image/jpeg",
          lastModified: Date.now()
        });
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

  async function runWithDelayedObjectUrlCleanup(callback) {
    const nativeRevoke = URL.revokeObjectURL;
    const delayed = [];
    let patched = false;

    try {
      URL.revokeObjectURL = (url) => delayed.push(url);
      patched = URL.revokeObjectURL !== nativeRevoke;
    } catch (_error) {
      patched = false;
    }

    try {
      return await callback();
    } finally {
      if (patched) {
        try { URL.revokeObjectURL = nativeRevoke; } catch (_error) { /* ignored */ }
        window.setTimeout(() => {
          for (const url of delayed) {
            try { nativeRevoke.call(URL, url); } catch (_error) { /* ignored */ }
          }
        }, 15000);
      }
    }
  }

  window.TallamMinistryExporter = Object.freeze({
    ...exporter,
    __mobilePhotoCompatibility: true,
    photoCompatibilityBuild: COMPAT_BUILD,
    async generate(options = {}) {
      const originalPhoto = options.photoFile;
      if (!(originalPhoto instanceof Blob) || !originalPhoto.size) {
        return exporter.generate(options);
      }

      const standardPhoto = await normalizePhoto(originalPhoto, false);
      try {
        return await runWithDelayedObjectUrlCleanup(() => exporter.generate({ ...options, photoFile: standardPhoto }));
      } catch (error) {
        const message = String(error?.message || "");
        if (!message.includes("الصورة الشخصية") && !message.includes("صور الاستمارة")) throw error;
        const compactPhoto = await normalizePhoto(originalPhoto, true);
        return runWithDelayedObjectUrlCleanup(() => exporter.generate({ ...options, photoFile: compactPhoto }));
      }
    }
  });

  const photoInput = document.getElementById("personal_photo");
  photoInput?.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (file) void normalizePhoto(file, false).catch(() => {});
  }, { passive: true });

  document.body.dataset.photoCompatibilityReady = "true";
})();
