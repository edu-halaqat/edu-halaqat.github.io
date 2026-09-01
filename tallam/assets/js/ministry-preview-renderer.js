(() => {
  "use strict";

  const BUILD = "4.0.0-synchronized-page-v1";
  const BOXES = Object.freeze({
    full_name:        { x: 87,   y: 470,  w: 1244, h: 69, size: 25, min: 16 },
    identity_number:  { x: 915,  y: 683,  w: 414,  h: 54, size: 22, min: 15 },
    identity_type:    { x: 500,  y: 683,  w: 414,  h: 54, size: 22, min: 14 },
    identity_expiry:  { x: 87,   y: 683,  w: 413,  h: 54, size: 22, min: 14 },
    nationality:      { x: 915,  y: 792,  w: 414,  h: 54, size: 22, min: 14 },
    gender:           { x: 500,  y: 792,  w: 414,  h: 54, size: 22, min: 14 },
    birth_place_date: { x: 87,   y: 792,  w: 413,  h: 54, size: 20, min: 12 },
    qualification:    { x: 1018, y: 990,  w: 311,  h: 54, size: 20, min: 12 },
    specialization:   { x: 707,  y: 990,  w: 311,  h: 54, size: 20, min: 12 },
    workplace:        { x: 396,  y: 990,  w: 311,  h: 54, size: 19, min: 11 },
    job_title:        { x: 87,   y: 990,  w: 309,  h: 54, size: 19, min: 11 },
    phone:            { x: 1018, y: 1185, w: 311,  h: 55, size: 20, min: 13 },
    mobile:           { x: 707,  y: 1185, w: 311,  h: 55, size: 20, min: 13 },
    city:             { x: 396,  y: 1185, w: 311,  h: 55, size: 20, min: 12 },
    region:           { x: 85,   y: 1185, w: 311,  h: 55, size: 20, min: 12 },
    district:         { x: 1018, y: 1295, w: 311,  h: 54, size: 19, min: 11 },
    street:           { x: 707,  y: 1295, w: 311,  h: 54, size: 19, min: 11 },
    building_number:  { x: 396,  y: 1295, w: 311,  h: 54, size: 20, min: 13 },
    apartment_number: { x: 85,   y: 1295, w: 311,  h: 54, size: 20, min: 13 },
    twitter:          { x: 87,   y: 1435, w: 790,  h: 54, size: 18, min: 11 },
    facebook:         { x: 87,   y: 1489, w: 790,  h: 55, size: 18, min: 11 },
    email:            { x: 87,   y: 1544, w: 790,  h: 54, size: 18, min: 10 }
  });

  let backgroundPromise = null;

  async function generate({ values, photoFile, signatureBlob }) {
    if (!values || !(signatureBlob instanceof Blob)) throw new Error("بيانات الاستمارة أو التوقيع غير مكتملة.");
    const normalized = normalizeValues(values);
    const [background, signatureCanvas] = await Promise.all([
      getOfficialBackground(),
      prepareSignature(signatureBlob)
    ]);
    const canvas = await renderForm(background, normalized, photoFile, signatureCanvas);
    const snapshot = captureCanvas(canvas);
    const metrics = validateSnapshot(snapshot);
    const previewPngBlob = await canvasToBlob(canvas, "image/png");
    const bytes = new Uint8Array(await previewPngBlob.arrayBuffer());
    validatePng(bytes, snapshot.width, snapshot.height);
    return {
      previewPngBlob,
      values: normalized,
      exportBuild: BUILD,
      integrity: {
        width: snapshot.width,
        height: snapshot.height,
        darkRatio: metrics.darkRatio,
        lightRatio: metrics.lightRatio,
        maximumDarkRowRatio: metrics.maximumDarkRowRatio,
        maximumConsecutiveDarkRows: metrics.maximumConsecutiveDarkRows,
        pngSha256: await sha256Hex(bytes),
        renderer: "canonical_canvas_preview"
      }
    };
  }

  async function getOfficialBackground() {
    if (backgroundPromise) return backgroundPromise;
    const source = window.TallamOfficialMinistryBackground;
    if (!source) throw new Error("تعذر تحديد ملف الاستمارة الرسمية.");
    backgroundPromise = loadImage(source, "تعذر قراءة الاستمارة الرسمية.");
    try {
      const image = await backgroundPromise;
      if ((image.naturalWidth || image.width) !== 1414 || (image.naturalHeight || image.height) !== 2000) {
        throw new Error("أبعاد الاستمارة الرسمية غير صحيحة.");
      }
      return image;
    } catch (error) {
      backgroundPromise = null;
      throw error;
    }
  }

  function normalizeValues(values) {
    const clean = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    const digits = (value) => clean(value)
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/\D/g, "");
    let mobile = digits(values.mobile);
    if (mobile.startsWith("966")) mobile = mobile.slice(3);
    if (mobile && !mobile.startsWith("0")) mobile = `0${mobile}`;
    const date = clean(values.identity_expiry);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return {
      full_name: clean(values.full_name),
      identity_number: digits(values.identity_number),
      identity_type: clean(values.identity_type),
      identity_expiry: match ? `${match[3]}/${match[2]}/${match[1]}` : date,
      nationality: clean(values.nationality),
      gender: clean(values.gender),
      birth_place_date: clean(values.birth_place_date),
      qualification: clean(values.qualification),
      specialization: clean(values.specialization),
      workplace: clean(values.workplace) || "لا يوجد",
      job_title: clean(values.job_title) || "لا يوجد",
      phone: clean(values.phone) || "لا يوجد",
      mobile,
      city: clean(values.city),
      region: clean(values.region),
      district: clean(values.district),
      street: clean(values.street),
      building_number: clean(values.building_number),
      apartment_number: clean(values.apartment_number) || "لا يوجد",
      twitter: clean(values.twitter) || "لا يوجد",
      facebook: clean(values.facebook) || "لا يوجد",
      email: clean(values.email)
    };
  }

  async function renderForm(background, values, photoFile, signatureCanvas) {
    await document.fonts?.ready;
    try { await document.fonts?.load('600 24px "Noto Naskh Arabic"'); } catch { /* optional */ }
    const canvas = document.createElement("canvas");
    canvas.width = 1414;
    canvas.height = 2000;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("تعذر تجهيز لوحة الاستمارة الرسمية.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(background, 0, 0, canvas.width, canvas.height);
    for (const [key, box] of Object.entries(BOXES)) drawFittedText(context, values[key] || "—", box);

    if (photoFile instanceof Blob && photoFile.size > 0) {
      const loadedPhoto = await loadDrawable(photoFile, "تعذرت قراءة الصورة الشخصية المحفوظة.");
      try {
        drawImageCover(context, loadedPhoto.drawable, { x: 76, y: 133, w: 195, h: 242 }, true);
      } finally {
        loadedPhoto.release();
      }
    }

    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(801, 1647, 348, 36);
    context.restore();
    drawFittedText(context, values.full_name || "—", { x: 801, y: 1647, w: 348, h: 36, size: 18, min: 11 }, "#b42318");
    drawImageContain(context, signatureCanvas, { x: 82, y: 1695, w: 300, h: 72 });
    return canvas;
  }

  function drawFittedText(context, rawValue, box, color = "#101010") {
    const text = String(rawValue || "—").trim() || "—";
    const maximumWidth = Math.max(10, box.w - 18);
    let size = box.size || 20;
    const minimum = box.min || 11;
    context.save();
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.direction = /[\u0600-\u06ff]/.test(text) ? "rtl" : "ltr";
    while (size > minimum) {
      context.font = `600 ${size}px "Noto Naskh Arabic", "Alyamama", "Traditional Arabic", Tahoma, Arial, sans-serif`;
      if (context.measureText(text).width <= maximumWidth) break;
      size -= 1;
    }
    context.font = `600 ${size}px "Noto Naskh Arabic", "Alyamama", "Traditional Arabic", Tahoma, Arial, sans-serif`;
    context.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1, maximumWidth);
    context.restore();
  }

  async function prepareSignature(blob) {
    const loaded = await loadDrawable(blob, "تعذر قراءة التوقيع الإلكتروني المحفوظ.");
    try {
      const image = loaded.drawable;
      const source = document.createElement("canvas");
      source.width = Math.max(1, image.naturalWidth || image.width);
      source.height = Math.max(1, image.naturalHeight || image.height);
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) throw new Error("تعذر تجهيز التوقيع الإلكتروني.");
      sourceContext.clearRect(0, 0, source.width, source.height);
      sourceContext.drawImage(image, 0, 0, source.width, source.height);
      const bounds = findInkBounds(sourceContext, source.width, source.height);
      if (!bounds) throw new Error("التوقيع الإلكتروني المحفوظ فارغ.");

      const output = document.createElement("canvas");
      output.width = 900;
      output.height = 260;
      const context = output.getContext("2d");
      if (!context) throw new Error("تعذر تجهيز التوقيع الإلكتروني.");
      const scale = Math.min(850 / bounds.w, 210 / bounds.h);
      const width = bounds.w * scale;
      const height = bounds.h * scale;
      context.clearRect(0, 0, output.width, output.height);
      context.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, (output.width - width) / 2, (output.height - height) / 2, width, height);
      return output;
    } finally {
      loaded.release();
    }
  }

  function findInkBounds(context, width, height) {
    const data = context.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3];
        const notWhite = data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245;
        if (alpha > 12 && notWhite) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    return maxX >= minX ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
  }

  function drawImageCover(context, image, box, border) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.max(box.w / imageWidth, box.h / imageHeight);
    const sourceWidth = box.w / scale;
    const sourceHeight = box.h / scale;
    const sourceX = Math.max(0, (imageWidth - sourceWidth) / 2);
    const sourceY = Math.max(0, (imageHeight - sourceHeight) / 2);
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(box.x, box.y, box.w, box.h);
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, box.x, box.y, box.w, box.h);
    if (border) {
      context.strokeStyle = "#111111";
      context.lineWidth = 2;
      context.strokeRect(box.x, box.y, box.w, box.h);
    }
    context.restore();
  }

  function drawImageContain(context, image, box) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.min(box.w / imageWidth, box.h / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    context.drawImage(image, box.x + (box.w - width) / 2, box.y + (box.h - height) / 2, width, height);
  }

  function captureCanvas(canvas) {
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("تعذر قراءة الاستمارة بعد تعبئتها.");
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, rgba: image.data };
  }

  function validateSnapshot(snapshot) {
    const { width, height, rgba } = snapshot;
    if (width !== 1414 || height !== 2000 || rgba.length !== width * height * 4) throw new Error("تعذر إنشاء صفحة الاستمارة الرسمية بالأبعاد الصحيحة.");
    const stride = 4;
    let sampled = 0, dark = 0, light = 0, maximumDarkRowRatio = 0;
    let consecutiveDarkRows = 0, maximumConsecutiveDarkRows = 0;
    for (let y = 0; y < height; y += stride) {
      let rowSamples = 0, rowDark = 0;
      for (let x = 0; x < width; x += stride) {
        const index = (y * width + x) * 4;
        const red = rgba[index], green = rgba[index + 1], blue = rgba[index + 2];
        if (red < 38 && green < 38 && blue < 38) { dark += 1; rowDark += 1; }
        if (red > 215 && green > 215 && blue > 215) light += 1;
        rowSamples += 1; sampled += 1;
      }
      const ratio = rowSamples ? rowDark / rowSamples : 0;
      maximumDarkRowRatio = Math.max(maximumDarkRowRatio, ratio);
      if (ratio > 0.58) {
        consecutiveDarkRows += 1;
        maximumConsecutiveDarkRows = Math.max(maximumConsecutiveDarkRows, consecutiveDarkRows);
      } else consecutiveDarkRows = 0;
    }
    const darkRatio = sampled ? dark / sampled : 1;
    const lightRatio = sampled ? light / sampled : 0;
    if (darkRatio > 0.34 || lightRatio < 0.45 || maximumConsecutiveDarkRows >= 6) {
      throw new Error("أوقف النظام التصدير لأن صفحة الاستمارة لم تجتز فحص السلامة البصرية.");
    }
    return { darkRatio, lightRatio, maximumDarkRowRatio, maximumConsecutiveDarkRows };
  }

  async function loadDrawable(source, errorMessage) {
    if (!(source instanceof Blob)) {
      return { drawable: await loadImage(source, errorMessage), release() {} };
    }

    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(source, {
          imageOrientation: "from-image",
          premultiplyAlpha: "default",
          colorSpaceConversion: "default"
        });
        return { drawable: bitmap, release: () => bitmap.close?.() };
      } catch {
        try {
          const bitmap = await createImageBitmap(source);
          return { drawable: bitmap, release: () => bitmap.close?.() };
        } catch { /* fall through to HTML image */ }
      }
    }

    const objectUrl = URL.createObjectURL(source);
    try {
      const image = await loadImage(objectUrl, errorMessage);
      return {
        drawable: image,
        release: () => window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  function loadImage(source, errorMessage) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
      const release = () => { if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); };
      image.onload = () => { release(); resolve(image); };
      image.onerror = () => { release(); reject(new Error(errorMessage || "تعذر قراءة الصورة.")); };
      image.decoding = "async";
      image.src = objectUrl || source;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob && blob.size > 20_000 ? resolve(blob) : reject(new Error("تعذر إنشاء صورة الاستمارة النهائية.")), type, quality);
    });
  }

  function validatePng(bytes, width, height) {
    if (bytes.length < 33 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      throw new Error("صورة الاستمارة النهائية غير صالحة.");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) !== width || view.getUint32(20) !== height) throw new Error("أبعاد صورة الاستمارة النهائية غير صحيحة.");
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  window.TallamMinistryPreviewRenderer = Object.freeze({ build: BUILD, generate });
})();
