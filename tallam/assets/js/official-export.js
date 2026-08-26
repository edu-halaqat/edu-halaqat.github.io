"use strict";

(() => {
  const ASSET_BASE = "https://fvzoogbdezueswyihxiz.supabase.co/storage/v1/object/public/teacher-form-assets";
  const OFFICIAL_ASSETS = Object.freeze({
    template: `${ASSET_BASE}/ministry-official-template-v3.docx`,
    background: `${ASSET_BASE}/ministry-official-background-v3.webp`,
    map: `${ASSET_BASE}/ministry-field-map-v3.json`
  });

  const TOKEN_FIELDS = [
    "full_name", "identity_number", "identity_type", "identity_expiry", "nationality", "gender", "birth_place_date",
    "qualification", "specialization", "workplace", "job_title", "phone", "mobile", "email", "city", "region",
    "district", "street", "building_number", "apartment_number", "twitter", "facebook", "iban", "bank",
    "account_holder", "quran_memorization", "has_sanad", "reading_narration", "has_nooraniyah", "has_madaniyah",
    "experience_years", "previous_entities"
  ];

  const assetCache = new Map();

  async function fetchAsset(url, type) {
    const key = `${type}:${url}`;
    if (!assetCache.has(key)) {
      assetCache.set(key, (async () => {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`تعذر تحميل قالب الاستمارة الرسمي (${response.status}).`);
        if (type === "arrayBuffer") return response.arrayBuffer();
        if (type === "json") return response.json();
        if (type === "blob") return response.blob();
        return response.text();
      })());
    }
    return assetCache.get(key);
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function exportValue(field) {
    if (field === "identity_number") return normalizedIdentity();
    if (field === "mobile") return normalizedMobile() ? `0${normalizedMobile()}` : "";
    if (field === "iban") return normalizedIban();
    const value = fieldValue(field);
    if (["phone", "apartment_number", "twitter", "facebook", "workplace", "job_title", "previous_entities"].includes(field)) {
      return value || "لا يوجد";
    }
    return value;
  }

  async function blobToImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = "async";
      image.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("تعذر قراءة صورة قالب الاستمارة."));
        image.src = url;
      });
      return image;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  async function fileToImage(file) {
    if (!file) return null;
    return blobToImage(file);
  }

  function canvasBlob(sourceCanvas, type = "image/png", quality = 0.96) {
    return new Promise((resolve, reject) => {
      sourceCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("تعذر إنشاء الصورة.")), type, quality);
    });
  }

  async function imageFileToPng(file, width, height, mode = "cover") {
    if (!file) return null;
    const image = await fileToImage(file);
    const out = document.createElement("canvas");
    out.width = Math.max(8, Math.round(width));
    out.height = Math.max(8, Math.round(height));
    const c = out.getContext("2d");
    c.clearRect(0, 0, out.width, out.height);
    const scale = mode === "contain"
      ? Math.min(out.width / image.naturalWidth, out.height / image.naturalHeight)
      : Math.max(out.width / image.naturalWidth, out.height / image.naturalHeight);
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    c.drawImage(image, (out.width - drawW) / 2, (out.height - drawH) / 2, drawW, drawH);
    return canvasBlob(out, "image/png");
  }

  function fitFont(ctx, text, maxWidth, start, minimum = 12) {
    let size = start;
    while (size > minimum) {
      ctx.font = `600 ${size}px Alyamama, Tahoma, Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 1;
    }
    return size;
  }

  function splitWords(ctx, text, maxWidth, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines - 1) break;
      }
    }
    if (line && lines.length < maxLines) {
      const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
      const remainder = words.slice(consumed).join(" ");
      lines.push(remainder || line);
    }
    return lines.slice(0, maxLines);
  }

  function drawValue(ctx, field, value, rect, pageScale) {
    if (!value || !rect) return;
    const [x1, y1, x2, y2] = rect;
    const width = Math.max(12, x2 - x1);
    const height = Math.max(10, y2 - y1);
    const maxLines = height > 55 * pageScale ? 2 : 1;
    const startSize = Math.min(26 * pageScale, height * (maxLines === 1 ? 0.52 : 0.34));
    const minimum = Math.max(10 * pageScale, 8);
    ctx.save();
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = /^(identity_number|identity_expiry|mobile|phone|iban|building_number|apartment_number|email|twitter|facebook)$/.test(field) ? "ltr" : "rtl";
    let size = fitFont(ctx, String(value), width * 0.92, startSize, minimum);
    ctx.font = `600 ${size}px Alyamama, Tahoma, Arial, sans-serif`;
    const lines = splitWords(ctx, String(value), width * 0.92, maxLines);
    if (lines.length === 2) {
      while (size > minimum && lines.some((line) => ctx.measureText(line).width > width * 0.92)) {
        size -= 1;
        ctx.font = `600 ${size}px Alyamama, Tahoma, Arial, sans-serif`;
      }
    }
    const lineHeight = size * 1.25;
    const total = lineHeight * Math.max(lines.length, 1);
    lines.forEach((line, index) => ctx.fillText(line, (x1 + x2) / 2, (y1 + y2) / 2 - total / 2 + lineHeight * (index + 0.5), width * 0.94));
    ctx.restore();
  }

  function drawImageCover(ctx, image, rect, contain = false) {
    if (!image || !rect) return;
    const [x1, y1, x2, y2] = rect;
    const width = x2 - x1;
    const height = y2 - y1;
    const scale = contain
      ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
      : Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, y1, width, height);
    ctx.clip();
    ctx.drawImage(image, x1 + (width - drawW) / 2, y1 + (height - drawH) / 2, drawW, drawH);
    ctx.restore();
  }

  async function buildOfficialDocx(templateBuffer, signatureBlob) {
    const zip = await window.JSZip.loadAsync(templateBuffer.slice(0));
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) throw new Error("قالب Word الرسمي غير صالح.");
    let xml = await documentFile.async("string");
    for (const field of TOKEN_FIELDS) {
      const token = `{{${field.toUpperCase()}}}`;
      xml = xml.split(token).join(escapeXml(exportValue(field)));
    }
    zip.file("word/document.xml", xml);

    const photoInput = form.querySelector('input[name="personal_photo"]');
    const photo = photoInput?.files?.[0] || null;
    if (photo && zip.file("word/media/applicant-photo.png")) {
      const png = await imageFileToPng(photo, 500, 650, "cover");
      zip.file("word/media/applicant-photo.png", await png.arrayBuffer());
    }
    if (signatureBlob && zip.file("word/media/applicant-signature.png")) {
      zip.file("word/media/applicant-signature.png", await signatureBlob.arrayBuffer());
    }

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
  }

  async function buildOfficialPdf(backgroundBlob, map, signatureBlob) {
    const background = await blobToImage(backgroundBlob);
    const pageWidth = Number(map?.page?.width) || background.naturalWidth;
    const pageHeight = Number(map?.page?.height) || background.naturalHeight;
    const out = document.createElement("canvas");
    out.width = pageWidth;
    out.height = pageHeight;
    const c = out.getContext("2d", { alpha: false });
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, pageWidth, pageHeight);
    c.drawImage(background, 0, 0, pageWidth, pageHeight);

    if (document.fonts?.ready) await document.fonts.ready;
    const pageScale = pageWidth / 1240;
    for (const [field, rect] of Object.entries(map?.fields || {})) drawValue(c, field, exportValue(field), rect, pageScale);

    const photoInput = form.querySelector('input[name="personal_photo"]');
    const photo = await fileToImage(photoInput?.files?.[0] || null);
    const signature = signatureBlob ? await blobToImage(signatureBlob) : null;
    drawImageCover(c, photo, [pageWidth * 0.035, pageHeight * 0.035, pageWidth * 0.190, pageHeight * 0.180], false);
    drawImageCover(c, signature, [pageWidth * 0.355, pageHeight * 0.865, pageWidth * 0.640, pageHeight * 0.940], true);

    const imageData = out.toDataURL("image/jpeg", 0.98);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.addImage(imageData, "JPEG", 0, 0, 210, 297, undefined, "SLOW");
    return pdf.output("blob");
  }

  async function officialGenerateExports() {
    if (!window.JSZip || !window.jspdf) throw new Error("تعذر تحميل أدوات إصدار الملفات. تحقق من اتصال الإنترنت ثم أعد المحاولة.");
    const [templateBuffer, backgroundBlob, map] = await Promise.all([
      fetchAsset(OFFICIAL_ASSETS.template, "arrayBuffer"),
      fetchAsset(OFFICIAL_ASSETS.background, "blob"),
      fetchAsset(OFFICIAL_ASSETS.map, "json")
    ]);
    const signatureBlob = await canvasToBlob(canvas);
    const [docxBlob, pdfBlob] = await Promise.all([
      buildOfficialDocx(templateBuffer, signatureBlob),
      buildOfficialPdf(backgroundBlob, map, signatureBlob)
    ]);
    return { docxBlob, pdfBlob };
  }

  generateExports = officialGenerateExports;
})();
