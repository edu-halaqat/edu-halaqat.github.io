(() => {
  "use strict";

  const EXPORT_BUILD = "20260828-docx-inline-v2";
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const PAGE = Object.freeze({ widthTwips: 11906, heightTwips: 16838, marginTwips: 120 });
  const EMU_PER_TWIP = 635;

  const original = window.TallamMinistryExporter;
  if (!original?.generate) {
    throw new Error("تعذر تهيئة أداة تصحيح ملف Word.");
  }

  async function generate(options) {
    const result = await original.generate(options);
    const docxBlob = await rebuildStableDocx(result.docxBlob);
    return { ...result, docxBlob };
  }

  async function rebuildStableDocx(sourceBlob) {
    if (!window.JSZip) throw new Error("تعذر تحميل أداة إنشاء ملف Word.");
    if (!(sourceBlob instanceof Blob)) throw new Error("ملف Word الأصلي غير صالح.");

    const source = await window.JSZip.loadAsync(sourceBlob);
    const media = findRenderedFormImage(source);
    if (!media) throw new Error("تعذر العثور على صورة الاستمارة المعبأة داخل ملف Word.");

    const imageBytes = await media.file.async("uint8array");
    const dimensions = readImageDimensions(imageBytes, media.extension);
    const extent = fitToA4(dimensions.width, dimensions.height);
    const targetName = `form-image.${media.extension}`;

    const zip = new window.JSZip();
    zip.file("[Content_Types].xml", contentTypesXml(media.extension, media.mimeType));
    zip.file("_rels/.rels", rootRelationshipsXml());
    zip.file("docProps/core.xml", corePropertiesXml());
    zip.file("docProps/app.xml", appPropertiesXml());
    zip.file("word/document.xml", documentXml(extent.cx, extent.cy, targetName));
    zip.file("word/_rels/document.xml.rels", documentRelationshipsXml(targetName));
    zip.file("word/styles.xml", stylesXml());
    zip.file(`word/media/${targetName}`, imageBytes);

    return zip.generateAsync({
      type: "blob",
      mimeType: DOCX_MIME,
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
  }

  function findRenderedFormImage(zip) {
    const candidates = [
      ["word/media/official-filled-form.jpg", "jpg", "image/jpeg"],
      ["word/media/official-filled-form.jpeg", "jpeg", "image/jpeg"],
      ["word/media/form-image.png", "png", "image/png"]
    ];
    for (const [path, extension, mimeType] of candidates) {
      const file = zip.file(path);
      if (file) return { file, extension, mimeType };
    }
    return null;
  }

  function readImageDimensions(bytes, extension) {
    if (extension === "png") {
      if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
        throw new Error("صورة الاستمارة داخل Word غير صالحة.");
      }
      return {
        width: readUint32BE(bytes, 16),
        height: readUint32BE(bytes, 20)
      };
    }

    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error("صورة الاستمارة داخل Word غير صالحة.");
    }
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: (bytes[offset + 3] << 8) | bytes[offset + 4],
          width: (bytes[offset + 5] << 8) | bytes[offset + 6]
        };
      }
      offset += length;
    }
    throw new Error("تعذر قراءة أبعاد صورة الاستمارة داخل Word.");
  }

  function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function fitToA4(widthPx, heightPx) {
    const safeWidth = Math.max(1, widthPx);
    const safeHeight = Math.max(1, heightPx);
    const maxWidth = (PAGE.widthTwips - PAGE.marginTwips * 2) * EMU_PER_TWIP;
    const maxHeight = (PAGE.heightTwips - PAGE.marginTwips * 2) * EMU_PER_TWIP;
    const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight);
    return {
      cx: Math.max(1, Math.round(safeWidth * scale)),
      cy: Math.max(1, Math.round(safeHeight * scale))
    };
  }

  function contentTypesXml(extension, mimeType) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="${extension}" ContentType="${mimeType}"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  }

  function rootRelationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  }

  function corePropertiesXml() {
    const timestamp = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>استمارة معلومات شخصية - وزارة الشؤون الإسلامية</dc:title>
  <dc:creator>بوابة جمعية تعلّم</dc:creator>
  <cp:lastModifiedBy>بوابة جمعية تعلّم</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
  }

  function appPropertiesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Microsoft Office Word</Application>
  <Pages>1</Pages>
</Properties>`;
  }

  function documentRelationshipsXml(targetName) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${targetName}"/>
</Relationships>`;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
  </w:style>
</w:styles>`;
  }

  function documentXml(cx, cy, targetName) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
      <w:r><w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${cx}" cy="${cy}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="1" name="الاستمارة الرسمية المعبأة" descr="استمارة وزارة الشؤون الإسلامية المعبأة"/>
          <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
          <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr><pic:cNvPr id="0" name="${targetName}"/><pic:cNvPicPr/></pic:nvPicPr>
              <pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
              <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
            </pic:pic>
          </a:graphicData></a:graphic>
        </wp:inline>
      </w:drawing></w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="${PAGE.widthTwips}" w:h="${PAGE.heightTwips}"/>
      <w:pgMar w:top="${PAGE.marginTwips}" w:right="${PAGE.marginTwips}" w:bottom="${PAGE.marginTwips}" w:left="${PAGE.marginTwips}" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  window.TallamMinistryExporter = Object.freeze({
    ...original,
    generate,
    DOCX_MIME,
    EXPORT_BUILD
  });
})();