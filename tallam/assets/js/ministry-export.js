(() => {
  "use strict";

  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const PDF_MIME = "application/pdf";
  const encoder = new TextEncoder();
  let backgroundPromise;

  const PDF_BOXES = Object.freeze({
    full_name:          { x: 87,   y: 470,  w: 1244, h: 69, size: 25, min: 16 },
    identity_number:    { x: 915,  y: 683,  w: 414,  h: 54, size: 22, min: 15 },
    identity_type:      { x: 500,  y: 683,  w: 414,  h: 54, size: 22, min: 14 },
    identity_expiry:    { x: 87,   y: 683,  w: 413,  h: 54, size: 22, min: 14 },
    nationality:        { x: 915,  y: 792,  w: 414,  h: 54, size: 22, min: 14 },
    gender:             { x: 500,  y: 792,  w: 414,  h: 54, size: 22, min: 14 },
    birth_place_date:   { x: 87,   y: 792,  w: 413,  h: 54, size: 20, min: 12 },
    qualification:      { x: 1018, y: 990,  w: 311,  h: 54, size: 20, min: 12 },
    specialization:     { x: 707,  y: 990,  w: 311,  h: 54, size: 20, min: 12 },
    workplace:          { x: 396,  y: 990,  w: 311,  h: 54, size: 19, min: 11 },
    job_title:          { x: 87,   y: 990,  w: 309,  h: 54, size: 19, min: 11 },
    phone:              { x: 1018, y: 1185, w: 311,  h: 55, size: 20, min: 13 },
    mobile:             { x: 707,  y: 1185, w: 311,  h: 55, size: 20, min: 13 },
    city:               { x: 396,  y: 1185, w: 311,  h: 55, size: 20, min: 12 },
    region:             { x: 85,   y: 1185, w: 311,  h: 55, size: 20, min: 12 },
    district:           { x: 1018, y: 1295, w: 311,  h: 54, size: 19, min: 11 },
    street:             { x: 707,  y: 1295,  w: 311,  h: 54, size: 18, min: 10 },
    building_number:    { x: 396,  y: 1295, w: 311,  h: 54, size: 20, min: 13 },
    apartment_number:   { x: 85,   y: 1295, w: 311,  h: 54, size: 20, min: 13 },
    twitter:            { x: 87,   y: 1435, w: 790,  h: 54, size: 18, min: 11 },
    facebook:           { x: 87,   y: 1489, w: 790,  h: 55, size: 18, min: 11 },
    email:              { x: 87,   y: 1544, w: 790,  h: 54, size: 18, min: 10 }
  });

  async function generate({ values, photoFile, signatureBlob }) {
    if (!window.JSZip) throw new Error("تعذر تحميل أداة إنشاء ملف Word.");
    if (!window.TallamOfficialMinistryBackground) throw new Error("تعذر تحميل صورة الاستمارة الرسمية.");
    if (!values || !signatureBlob) throw new Error("بيانات الاستمارة أو التوقيع غير مكتملة.");
    const normalized = normalizeValues(values);
    const [background, signaturePng] = await Promise.all([getBackground(), prepareSignaturePng(signatureBlob)]);
    const canvas = await renderOfficialForm(background, normalized, photoFile, signaturePng);
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.99);
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const [docxBlob, pdfBlob] = await Promise.all([
      createImageDocx(jpegBytes, canvas.width, canvas.height),
      Promise.resolve(new Blob([buildJpegPdf(jpegBytes, canvas.width, canvas.height)], { type: PDF_MIME }))
    ]);
    return { docxBlob, pdfBlob, signatureBlob, values: normalized };
  }

  function getBackground() {
    backgroundPromise ||= loadImage(window.TallamOfficialMinistryBackground);
    return backgroundPromise;
  }

  function normalizeValues(values) {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const digits = (value) => clean(value)
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/\D/g, "");
    let mobile = digits(values.mobile);
    if (mobile.startsWith("966")) mobile = mobile.slice(3);
    if (mobile && !mobile.startsWith("0")) mobile = `0${mobile}`;
    return {
      full_name: clean(values.full_name), identity_number: digits(values.identity_number),
      identity_type: clean(values.identity_type), identity_expiry: clean(values.identity_expiry),
      nationality: clean(values.nationality), gender: clean(values.gender),
      birth_place_date: clean(values.birth_place_date), qualification: clean(values.qualification),
      specialization: clean(values.specialization), workplace: clean(values.workplace) || "لا يوجد",
      job_title: clean(values.job_title) || "لا يوجد", phone: clean(values.phone) || "لا يوجد",
      mobile, city: clean(values.city), region: clean(values.region), district: clean(values.district),
      street: clean(values.street), building_number: clean(values.building_number),
      apartment_number: clean(values.apartment_number) || "لا يوجد",
      twitter: clean(values.twitter) || "لا يوجد", facebook: clean(values.facebook) || "لا يوجد",
      email: clean(values.email)
    };
  }

  async function renderOfficialForm(background, values, photoFile, signaturePng) {
    await document.fonts?.ready;
    try { await document.fonts?.load('600 24px "Noto Naskh Arabic"'); } catch (_) { /* fallback below */ }
    const canvas = document.createElement("canvas");
    // تُثبت أبعاد القالب الرسمي؛ وقد تكون صورة الخلفية مضغوطة للنقل فقط.
    canvas.width = 1414;
    canvas.height = 2000;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("تعذر تجهيز الاستمارة الرسمية.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(background, 0, 0, canvas.width, canvas.height);
    for (const [key, box] of Object.entries(PDF_BOXES)) drawText(context, values[key] || "—", box);
    if (photoFile) drawImageCover(context, await loadImage(photoFile), { x: 76, y: 133, w: 195, h: 242 }, true);

    // لا يُمس أي عنصر ثابت؛ تُزال نقاط خانة الاسم فقط ثم يُكتب الاسم في موضعها.
    context.save(); context.fillStyle = "#ffffff"; context.fillRect(801, 1647, 348, 36); context.restore();
    drawText(context, values.full_name || "—", { x: 801, y: 1647, w: 348, h: 36, size: 18, min: 11 }, "#e60000");
    drawImageContain(context, await loadImage(signaturePng), { x: 82, y: 1695, w: 300, h: 72 });
    return canvas;
  }

  function drawText(context, raw, box, color = "#101010") {
    const text = String(raw || "—").trim() || "—";
    const maxWidth = Math.max(10, box.w - 18);
    let size = box.size || 20;
    const minimum = box.min || 11;
    context.save();
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.direction = /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr";
    do {
      context.font = `600 ${size}px "Noto Naskh Arabic", "Traditional Arabic", Tahoma, Arial, sans-serif`;
      if (context.measureText(text).width <= maxWidth || size <= minimum) break;
      size -= 1;
    } while (size >= minimum);
    context.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1, maxWidth);
    context.restore();
  }

  async function createImageDocx(jpegBytes, widthPx, heightPx) {
    const zip = new window.JSZip();
    const now = new Date().toISOString();
    const cx = 7560000, cy = 10692000;
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
    zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>استمارة معلومات شخصية - وزارة الشؤون الإسلامية</dc:title><dc:creator>بوابة جمعية تعلّم</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);
    zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office Word</Application><Pages>1</Pages></Properties>`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/official-filled-form.jpg"/></Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr><w:r><w:drawing>
<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251700000" behindDoc="0" locked="1" layoutInCell="1" allowOverlap="1">
<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>
<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="1" name="الاستمارة الرسمية المعبأة" descr="استمارة وزارة الشؤون الإسلامية المعبأة دون تغيير التنسيق أو الشعار"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="official-filled-form.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>
</wp:anchor></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    zip.file("word/media/official-filled-form.jpg", jpegBytes);
    return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  async function prepareSignaturePng(blob) {
    const image = await loadImage(blob);
    const source = document.createElement("canvas");
    source.width = image.naturalWidth || image.width; source.height = image.naturalHeight || image.height;
    const sourceContext = source.getContext("2d"); sourceContext.clearRect(0, 0, source.width, source.height); sourceContext.drawImage(image, 0, 0);
    const bounds = opaqueBounds(sourceContext, source.width, source.height) || { x: 0, y: 0, w: source.width, h: source.height };
    const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 260;
    const context = canvas.getContext("2d"); context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(850 / Math.max(1, bounds.w), 210 / Math.max(1, bounds.h));
    const width = bounds.w * scale, height = bounds.h * scale;
    context.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvasToBlob(canvas, "image/png");
  }

  function opaqueBounds(context, width, height) {
    try {
      const data = context.getImageData(0, 0, width, height).data;
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > 8) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
      }
      return maxX >= minX ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
    } catch (_) { return null; }
  }

  function drawImageCover(context, image, box, border) {
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const scale = Math.max(box.w / iw, box.h / ih), sw = box.w / scale, sh = box.h / scale;
    const sx = Math.max(0, (iw - sw) / 2), sy = Math.max(0, (ih - sh) / 2);
    context.save(); context.fillStyle = "#ffffff"; context.fillRect(box.x, box.y, box.w, box.h);
    context.drawImage(image, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
    if (border) { context.strokeStyle = "#111111"; context.lineWidth = 2; context.strokeRect(box.x, box.y, box.w, box.h); }
    context.restore();
  }

  function drawImageContain(context, image, box) {
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const scale = Math.min(box.w / iw, box.h / ih), width = iw * scale, height = ih * scale;
    context.drawImage(image, box.x + (box.w - width) / 2, box.y + (box.h - height) / 2, width, height);
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.decoding = "async";
      const temporary = source instanceof Blob ? URL.createObjectURL(source) : null;
      image.onload = () => { if (temporary) URL.revokeObjectURL(temporary); resolve(image); };
      image.onerror = () => { if (temporary) URL.revokeObjectURL(temporary); reject(new Error("تعذر قراءة إحدى صور الاستمارة.")); };
      image.src = temporary || source;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("تعذر إنشاء ملف الاستمارة.")), type, quality));
  }

  function buildJpegPdf(jpeg, widthPx, heightPx) {
    const pageWidth = 595.276, pageHeight = 841.89, chunks = [], offsets = [0]; let length = 0;
    const push = (part) => { const bytes = typeof part === "string" ? encoder.encode(part) : part; chunks.push(bytes); length += bytes.length; };
    const object = (number, parts) => { offsets[number] = length; push(`${number} 0 obj\n`); parts.forEach(push); push("\nendobj\n"); };
    push("%PDF-1.4\n%âãÏÓ\n");
    object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]); object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
    object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`]);
    const stream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
    object(4, [`<< /Length ${encoder.encode(stream).length} >>\nstream\n`, stream, "endstream"]);
    object(5, [`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
    const xref = length; push("xref\n0 6\n0000000000 65535 f \n");
    for (let i = 1; i <= 5; i += 1) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const output = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  }

  window.TallamMinistryExporter = Object.freeze({ generate, DOCX_MIME, PDF_MIME });
})();
