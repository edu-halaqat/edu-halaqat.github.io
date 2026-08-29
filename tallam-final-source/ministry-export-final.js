(() => {
  "use strict";

  const EXPORT_BUILD = "20260829-final-static-png-v1";
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const PDF_MIME = "application/pdf";
  const PAGE_TWIPS = Object.freeze({ width: 11906, height: 16838, margin: 120 });
  const EMU_PER_TWIP = 635;
  const encoder = new TextEncoder();
  let backgroundPromise = null;

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

  async function generate({ values, photoFile, signatureBlob }) {
    if (!values || !(signatureBlob instanceof Blob)) throw new Error("بيانات الاستمارة أو التوقيع غير مكتملة.");
    if (!window.JSZip) throw new Error("تعذر تحميل أداة إنشاء ملف Word. تحقق من اتصال الإنترنت ثم أعد المحاولة.");
    if (typeof CompressionStream !== "function") throw new Error("المتصفح لا يدعم التصدير الآمن. استخدم إصدارًا حديثًا من Chrome أو Edge.");

    const normalized = normalizeValues(values);
    const [background, signatureCanvas] = await Promise.all([getOfficialBackground(), prepareSignature(signatureBlob)]);
    const canvas = await renderForm(background, normalized, photoFile, signatureCanvas);
    const snapshot = captureCanvas(canvas);
    const metrics = validateSnapshot(snapshot);
    const rgbBytes = rgbaToRgb(snapshot.rgba);
    const pngBlob = await canvasToBlob(canvas, "image/png");
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    validatePng(pngBytes, snapshot.width, snapshot.height);

    const [docxBlob, pdfBlob, rgbSha256, pngSha256] = await Promise.all([
      createDocx(pngBytes, snapshot.width, snapshot.height),
      createPdf(rgbBytes, snapshot.width, snapshot.height),
      sha256Hex(rgbBytes),
      sha256Hex(pngBytes)
    ]);

    return {
      docxBlob,
      pdfBlob,
      signatureBlob,
      previewPngBlob: pngBlob,
      values: normalized,
      exportBuild: EXPORT_BUILD,
      integrity: {
        width: snapshot.width,
        height: snapshot.height,
        darkRatio: metrics.darkRatio,
        lightRatio: metrics.lightRatio,
        maximumDarkRowRatio: metrics.maximumDarkRowRatio,
        rgbSha256,
        pngSha256
      }
    };
  }

  async function getOfficialBackground() {
    if (backgroundPromise) return backgroundPromise;
    const url = window.TallamOfficialMinistryBackground;
    if (!url) throw new Error("تعذر تحديد ملف الاستمارة الرسمية.");
    backgroundPromise = (async () => {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`تعذر تحميل الاستمارة الرسمية (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      validatePng(bytes, 1414, 2000);
      return loadImage(new Blob([bytes], { type: "image/png" }), "تعذر قراءة الاستمارة الرسمية بعد تنزيلها.");
    })();
    try {
      return await backgroundPromise;
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
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return {
      full_name: clean(values.full_name),
      identity_number: digits(values.identity_number),
      identity_type: clean(values.identity_type),
      identity_expiry: dateMatch ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}` : date,
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
    try { await document.fonts?.load('600 24px "Noto Naskh Arabic"'); } catch (_) {}
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
      const photo = await loadImage(photoFile, "تعذرت قراءة الصورة الشخصية. استخدم ملف JPG أو PNG سليمًا.");
      drawImageCover(context, photo, { x: 76, y: 133, w: 195, h: 242 }, true);
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
    const image = await loadImage(blob, "تعذر قراءة التوقيع الإلكتروني.");
    const source = document.createElement("canvas");
    source.width = Math.max(1, image.naturalWidth || image.width);
    source.height = Math.max(1, image.naturalHeight || image.height);
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("تعذر تجهيز التوقيع الإلكتروني.");
    sourceContext.clearRect(0, 0, source.width, source.height);
    sourceContext.drawImage(image, 0, 0, source.width, source.height);
    const bounds = findInkBounds(sourceContext, source.width, source.height);
    if (!bounds) throw new Error("التوقيع الإلكتروني فارغ؛ يرجى التوقيع داخل المساحة المخصصة.");
    const output = document.createElement("canvas");
    output.width = 900;
    output.height = 260;
    const context = output.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز التوقيع الإلكتروني.");
    context.clearRect(0, 0, output.width, output.height);
    const scale = Math.min(850 / bounds.w, 210 / bounds.h);
    const width = bounds.w * scale;
    const height = bounds.h * scale;
    context.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, (output.width - width) / 2, (output.height - height) / 2, width, height);
    return output;
  }

  function findInkBounds(context, width, height) {
    try {
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
    } catch (_) { return null; }
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
    let sampled = 0, dark = 0, light = 0, maximumDarkRowRatio = 0, consecutiveDarkRows = 0, maximumConsecutiveDarkRows = 0;
    for (let y = 0; y < height; y += stride) {
      let rowSamples = 0, rowDark = 0;
      for (let x = 0; x < width; x += stride) {
        const index = (y * width + x) * 4;
        const red = rgba[index], green = rgba[index + 1], blue = rgba[index + 2];
        if (red < 38 && green < 38 && blue < 38) { dark += 1; rowDark += 1; }
        if (red > 215 && green > 215 && blue > 215) light += 1;
        rowSamples += 1; sampled += 1;
      }
      const rowRatio = rowSamples ? rowDark / rowSamples : 0;
      maximumDarkRowRatio = Math.max(maximumDarkRowRatio, rowRatio);
      if (rowRatio > 0.58) {
        consecutiveDarkRows += 1;
        maximumConsecutiveDarkRows = Math.max(maximumConsecutiveDarkRows, consecutiveDarkRows);
      } else consecutiveDarkRows = 0;
    }
    const darkRatio = sampled ? dark / sampled : 1;
    const lightRatio = sampled ? light / sampled : 0;
    if (darkRatio > 0.34 || lightRatio < 0.45 || maximumConsecutiveDarkRows >= 6) throw new Error("أوقف النظام التصدير لأن صورة الاستمارة لم تجتز فحص السلامة البصرية. حدّث الصفحة ثم أعد المحاولة.");
    return { darkRatio, lightRatio, maximumDarkRowRatio, maximumConsecutiveDarkRows };
  }

  function rgbaToRgb(rgba) {
    const rgb = new Uint8Array((rgba.length / 4) * 3);
    let target = 0;
    for (let source = 0; source < rgba.length; source += 4) {
      const alpha = rgba[source + 3] / 255;
      rgb[target] = Math.round(rgba[source] * alpha + 255 * (1 - alpha));
      rgb[target + 1] = Math.round(rgba[source + 1] * alpha + 255 * (1 - alpha));
      rgb[target + 2] = Math.round(rgba[source + 2] * alpha + 255 * (1 - alpha));
      target += 3;
    }
    return rgb;
  }

  async function createPdf(rgbBytes, width, height) {
    const compressed = await deflate(rgbBytes);
    const pageWidth = 595.276, pageHeight = 841.89;
    const content = encoder.encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
    const parts = [], offsets = [0];
    let length = 0;
    const append = (part) => { const bytes = typeof part === "string" ? encoder.encode(part) : part; parts.push(bytes); length += bytes.length; };
    const object = (number, body) => { offsets[number] = length; append(`${number} 0 obj\n`); for (const part of body) append(part); append("\nendobj\n"); };
    append(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a]));
    object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
    object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
    object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`]);
    object(4, [`<< /Length ${content.length} >>\nstream\n`, content, "endstream"]);
    object(5, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`, compressed, "\nendstream"]);
    const xrefOffset = length;
    append("xref\n0 6\n"); append("0000000000 65535 f \n");
    for (let index = 1; index <= 5; index += 1) append(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
    append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob([concatenate(parts, length)], { type: PDF_MIME });
  }

  async function createDocx(pngBytes, width, height) {
    const extent = fitToPage(width, height);
    const zip = new window.JSZip();
    zip.file("[Content_Types].xml", contentTypesXml());
    zip.file("_rels/.rels", rootRelationshipsXml());
    zip.file("docProps/core.xml", corePropertiesXml());
    zip.file("docProps/app.xml", appPropertiesXml());
    zip.file("word/document.xml", documentXml(extent.cx, extent.cy));
    zip.file("word/_rels/document.xml.rels", documentRelationshipsXml());
    zip.file("word/styles.xml", stylesXml());
    zip.file("word/settings.xml", settingsXml());
    zip.file("word/media/form-image.png", pngBytes);
    return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  function fitToPage(width, height) {
    const maximumWidth = (PAGE_TWIPS.width - PAGE_TWIPS.margin * 2) * EMU_PER_TWIP;
    const maximumHeight = (PAGE_TWIPS.height - PAGE_TWIPS.margin * 2 - 60) * EMU_PER_TWIP;
    const scale = Math.min(maximumWidth / width, maximumHeight / height);
    return { cx: Math.round(width * scale), cy: Math.round(height * scale) };
  }

  function contentTypesXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`; }
  function rootRelationshipsXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`; }
  function corePropertiesXml() { const timestamp = new Date().toISOString(); return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>استمارة معلومات شخصية - وزارة الشؤون الإسلامية</dc:title><dc:creator>بوابة جمعية تعلّم</dc:creator><cp:lastModifiedBy>بوابة جمعية تعلّم</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`; }
  function appPropertiesXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application><Pages>1</Pages></Properties>`; }
  function documentRelationshipsXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/form-image.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`; }
  function stylesXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:style></w:styles>`; }
  function settingsXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:doNotAutoCompressPictures/><w:compat/></w:settings>`; }
  function documentXml(cx, cy) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="الاستمارة الرسمية المعبأة" descr="استمارة وزارة الشؤون الإسلامية المعبأة"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="form-image.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="${PAGE_TWIPS.width}" w:h="${PAGE_TWIPS.height}"/><w:pgMar w:top="${PAGE_TWIPS.margin}" w:right="${PAGE_TWIPS.margin}" w:bottom="${PAGE_TWIPS.margin}" w:left="${PAGE_TWIPS.margin}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`; }

  async function deflate(bytes) { const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate")); return new Uint8Array(await new Response(stream).arrayBuffer()); }
  function loadImage(source, errorMessage) { return new Promise((resolve, reject) => { const image = new Image(); image.decoding = "async"; const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : null; image.onload = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); resolve(image); }; image.onerror = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); reject(new Error(errorMessage || "تعذر قراءة الصورة.")); }; image.src = objectUrl || source; }); }
  function canvasToBlob(canvas, type, quality) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر إنشاء صورة الاستمارة.")), type, quality)); }
  function validatePng(bytes, expectedWidth, expectedHeight) { const signature = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]; if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value)) throw new Error("ملف خلفية الاستمارة ليس صورة PNG سليمة."); const width = readUint32BE(bytes,16), height = readUint32BE(bytes,20); if (width !== expectedWidth || height !== expectedHeight) throw new Error(`أبعاد الاستمارة غير صحيحة (${width}×${height}).`); }
  function readUint32BE(bytes, offset) { return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0; }
  async function sha256Hex(bytes) { const digest = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join(""); }
  function concatenate(parts, totalLength = parts.reduce((sum, part) => sum + part.length, 0)) { const output = new Uint8Array(totalLength); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }

  window.TallamMinistryExporter = Object.freeze({ generate, DOCX_MIME, PDF_MIME, EXPORT_BUILD });
})();