(() => {
  "use strict";

  const EXPORT_BUILD = "20260828-lossless-rgb-v1";
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const PDF_MIME = "application/pdf";
  const encoder = new TextEncoder();
  const PAGE_TWIPS = Object.freeze({ width: 11906, height: 16838, margin: 120 });
  const EMU_PER_INCH = 914400;
  const TWIPS_PER_INCH = 1440;
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
    if (!values || !signatureBlob) throw new Error("بيانات الاستمارة أو التوقيع غير مكتملة.");
    if (typeof CompressionStream !== "function") {
      throw new Error("المتصفح قديم ولا يدعم التصدير الآمن. استخدم إصدارًا حديثًا من Chrome أو Edge.");
    }

    const normalized = normalizeValues(values);
    const [background, signaturePng] = await Promise.all([
      getBackground(),
      prepareSignature(signatureBlob)
    ]);
    const canvas = await renderForm(background, normalized, photoFile, signaturePng);
    const snapshot = captureCanvas(canvas);
    assertIntegrity(snapshot);

    const pngBytes = await encodePng(snapshot);
    const docxBlob = createDocx(pngBytes, snapshot.width, snapshot.height);
    const pdfBlob = await createPdf(snapshot);
    return { docxBlob, pdfBlob, signatureBlob, values: normalized, exportBuild: EXPORT_BUILD };
  }

  function getBackground() {
    if (!window.TallamOfficialMinistryBackground) throw new Error("تعذر تحميل صورة الاستمارة الرسمية.");
    backgroundPromise ||= loadImage(window.TallamOfficialMinistryBackground, "تعذر قراءة خلفية الاستمارة الرسمية.");
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

  async function renderForm(background, values, photoFile, signaturePng) {
    await document.fonts?.ready;
    try { await document.fonts?.load('600 24px "Noto Naskh Arabic"'); } catch (_) { /* fallback below */ }

    const canvas = document.createElement("canvas");
    canvas.width = background.naturalWidth || background.width || 1414;
    canvas.height = background.naturalHeight || background.height || 2000;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("تعذر تجهيز لوحة الاستمارة.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(background, 0, 0, canvas.width, canvas.height);

    for (const [key, box] of Object.entries(BOXES)) drawText(context, values[key] || "—", box);

    if (photoFile) {
      const photo = await loadImage(photoFile, "تعذرت قراءة الصورة الشخصية. استخدم JPG أو PNG سليمًا.");
      drawCover(context, photo, { x: 76, y: 133, w: 195, h: 242 }, true);
    }

    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(801, 1647, 348, 36);
    context.restore();
    drawText(context, values.full_name || "—", { x: 801, y: 1647, w: 348, h: 36, size: 18, min: 11 }, "#e60000");

    const signature = await loadImage(signaturePng, "تعذر تجهيز صورة التوقيع الإلكتروني.");
    drawContain(context, signature, { x: 82, y: 1695, w: 300, h: 72 });
    return canvas;
  }

  function drawText(context, rawValue, box, color = "#101010") {
    const text = String(rawValue || "—").trim() || "—";
    const maxWidth = Math.max(10, box.w - 18);
    let size = box.size || 20;
    const minimum = box.min || 11;
    context.save();
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.direction = /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr";
    do {
      context.font = `600 ${size}px "Noto Naskh Arabic", "Alyamama", "Traditional Arabic", Tahoma, Arial, sans-serif`;
      if (context.measureText(text).width <= maxWidth || size <= minimum) break;
      size -= 1;
    } while (size >= minimum);
    context.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1, maxWidth);
    context.restore();
  }

  function captureCanvas(canvas) {
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("تعذر قراءة الاستمارة بعد تعبئتها.");
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, rgba: image.data };
  }

  function assertIntegrity(snapshot) {
    const { width, height, rgba } = snapshot;
    if (width < 1000 || height < 1400 || rgba.length !== width * height * 4) {
      throw new Error("تعذر إنشاء صورة كاملة للاستـمارة الرسمية.");
    }
    let dark = 0;
    let total = 0;
    const startY = Math.floor(height * 0.58);
    for (let y = startY; y < height; y += 5) {
      for (let x = 0; x < width; x += 5) {
        const index = (y * width + x) * 4;
        if (rgba[index] < 45 && rgba[index + 1] < 45 && rgba[index + 2] < 45) dark += 1;
        total += 1;
      }
    }
    if (total && dark / total > 0.18) {
      throw new Error("أوقف النظام التصدير لأن الصورة الناتجة لم تكن سليمة. حدّث الصفحة ثم أعد المحاولة.");
    }
  }

  async function prepareSignature(blob) {
    const sourceImage = await loadImage(blob, "تعذر قراءة التوقيع الإلكتروني.");
    const source = document.createElement("canvas");
    source.width = Math.max(1, sourceImage.naturalWidth || sourceImage.width);
    source.height = Math.max(1, sourceImage.naturalHeight || sourceImage.height);
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    sourceContext.clearRect(0, 0, source.width, source.height);
    sourceContext.drawImage(sourceImage, 0, 0);
    const bounds = opaqueBounds(sourceContext, source.width, source.height) || { x: 0, y: 0, w: source.width, h: source.height };

    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 260;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(850 / Math.max(1, bounds.w), 210 / Math.max(1, bounds.h));
    const width = bounds.w * scale;
    const height = bounds.h * scale;
    context.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvasToBlob(canvas, "image/png");
  }

  function opaqueBounds(context, width, height) {
    try {
      const data = context.getImageData(0, 0, width, height).data;
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (data[(y * width + x) * 4 + 3] > 8) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          }
        }
      }
      return maxX >= minX ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
    } catch (_) { return null; }
  }

  function drawCover(context, image, box, border) {
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

  function drawContain(context, image, box) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.min(box.w / imageWidth, box.h / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    context.drawImage(image, box.x + (box.w - width) / 2, box.y + (box.h - height) / 2, width, height);
  }

  function loadImage(source, errorMessage) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      const temporaryUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
      image.onload = () => {
        if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
        resolve(image);
      };
      image.onerror = () => {
        if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
        reject(new Error(errorMessage || "تعذر قراءة إحدى صور الاستمارة."));
      };
      image.src = temporaryUrl || source;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("تعذر إنشاء صورة التوقيع.")), type, quality);
    });
  }

  async function encodePng(snapshot) {
    const stride = snapshot.width * 4;
    const scanlines = new Uint8Array(snapshot.height * (stride + 1));
    for (let y = 0; y < snapshot.height; y += 1) {
      const target = y * (stride + 1);
      scanlines[target] = 0;
      scanlines.set(snapshot.rgba.subarray(y * stride, (y + 1) * stride), target + 1);
    }
    const compressed = await deflate(scanlines);
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, snapshot.width, false);
    view.setUint32(4, snapshot.height, false);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    return concatBytes([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", new Uint8Array())]);
  }

  function pngChunk(type, data) {
    const typeBytes = encoder.encode(type);
    const output = new Uint8Array(12 + data.length);
    const view = new DataView(output.buffer);
    view.setUint32(0, data.length, false);
    output.set(typeBytes, 4);
    output.set(data, 8);
    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes);
    crcInput.set(data, typeBytes.length);
    view.setUint32(8 + data.length, crc32(crcInput), false);
    return output;
  }

  async function createPdf(snapshot) {
    const pixels = snapshot.rgba.length / 4;
    const rgb = new Uint8Array(pixels * 3);
    for (let source = 0, target = 0; source < snapshot.rgba.length; source += 4) {
      rgb[target++] = snapshot.rgba[source];
      rgb[target++] = snapshot.rgba[source + 1];
      rgb[target++] = snapshot.rgba[source + 2];
    }
    const compressed = await deflate(rgb);
    return new Blob([buildRgbPdf(compressed, snapshot.width, snapshot.height)], { type: PDF_MIME });
  }

  async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function buildRgbPdf(compressed, width, height) {
    const pageWidth = 595.276;
    const pageHeight = 841.89;
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const push = (part) => {
      const bytes = typeof part === "string" ? encoder.encode(part) : part;
      chunks.push(bytes); length += bytes.length;
    };
    const object = (number, parts) => {
      offsets[number] = length;
      push(`${number} 0 obj\n`); parts.forEach(push); push("\nendobj\n");
    };
    push("%PDF-1.4\n%Tallam lossless export\n");
    object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
    object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
    object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`]);
    const drawing = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
    object(4, [`<< /Length ${encoder.encode(drawing).length} >>\nstream\n`, drawing, "endstream"]);
    object(5, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`, compressed, "\nendstream"]);
    const xref = length;
    push("xref\n0 6\n0000000000 65535 f \n");
    for (let index = 1; index <= 5; index += 1) push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return concatBytes(chunks, length);
  }

  function createDocx(pngBytes, width, height) {
    const usableWidth = (PAGE_TWIPS.width - PAGE_TWIPS.margin * 2) / TWIPS_PER_INCH * EMU_PER_INCH;
    const usableHeight = (PAGE_TWIPS.height - PAGE_TWIPS.margin * 2) / TWIPS_PER_INCH * EMU_PER_INCH;
    const scale = Math.min(usableWidth / width, usableHeight / height);
    const cx = Math.round(width * scale);
    const cy = Math.round(height * scale);
    const timestamp = new Date().toISOString();
    const entries = [
      { name: "[Content_Types].xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
      { name: "_rels/.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { name: "docProps/core.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>استمارة معلومات شخصية</dc:title><dc:creator>جمعية تعلّم</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>` },
      { name: "docProps/app.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application><Pages>1</Pages></Properties>` },
      { name: "word/styles.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:style></w:styles>` },
      { name: "word/_rels/document.xml.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/form-image.png"/></Relationships>` },
      { name: "word/document.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="الاستمارة الرسمية المعبأة"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="form-image.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="${PAGE_TWIPS.width}" w:h="${PAGE_TWIPS.height}"/><w:pgMar w:top="${PAGE_TWIPS.margin}" w:right="${PAGE_TWIPS.margin}" w:bottom="${PAGE_TWIPS.margin}" w:left="${PAGE_TWIPS.margin}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>` },
      { name: "word/media/form-image.png", bytes: pngBytes }
    ].map((entry) => ({ name: entry.name, bytes: entry.bytes || encoder.encode(entry.text) }));
    return new Blob([writeZip(entries)], { type: DOCX_MIME });
  }

  function writeZip(entries) {
    const normalized = entries.map((entry) => ({ name: entry.name, nameBytes: encoder.encode(entry.name), bytes: entry.bytes }));
    const { time, date } = dosDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    for (const entry of normalized) {
      const crc = crc32(entry.bytes);
      const flag = /[^\x00-\x7f]/.test(entry.name) ? 0x0800 : 0;
      const local = new Uint8Array(30 + entry.nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, flag, true);
      localView.setUint16(8, 0, true); localView.setUint16(10, time, true); localView.setUint16(12, date, true);
      localView.setUint32(14, crc, true); localView.setUint32(18, entry.bytes.length, true); localView.setUint32(22, entry.bytes.length, true);
      localView.setUint16(26, entry.nameBytes.length, true); localView.setUint16(28, 0, true); local.set(entry.nameBytes, 30);
      localParts.push(local, entry.bytes);
      const central = new Uint8Array(46 + entry.nameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true);
      centralView.setUint16(8, flag, true); centralView.setUint16(10, 0, true); centralView.setUint16(12, time, true); centralView.setUint16(14, date, true);
      centralView.setUint32(16, crc, true); centralView.setUint32(20, entry.bytes.length, true); centralView.setUint32(24, entry.bytes.length, true);
      centralView.setUint16(28, entry.nameBytes.length, true); centralView.setUint16(30, 0, true); centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true); centralView.setUint16(36, 0, true); centralView.setUint32(38, 0, true); centralView.setUint32(42, localOffset, true);
      central.set(entry.nameBytes, 46); centralParts.push(central); localOffset += local.length + entry.bytes.length;
    }
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, normalized.length, true); endView.setUint16(10, normalized.length, true);
    endView.setUint32(12, centralSize, true); endView.setUint32(16, localOffset, true);
    return concatBytes([...localParts, ...centralParts, end], localOffset + centralSize + end.length);
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let number = 0; number < 256; number += 1) {
      let value = number;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      table[number] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31),
      date: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
    };
  }

  function concatBytes(parts, explicitLength) {
    const total = explicitLength ?? parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  window.TallamMinistryExporter = Object.freeze({ generate, DOCX_MIME, PDF_MIME, EXPORT_BUILD });
})();