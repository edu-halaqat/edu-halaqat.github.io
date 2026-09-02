(() => {
  "use strict";

  const RELEASE = "20260902-office-export-v3";
  const EXPORT_VERSION = "4.2.0-synchronized-office-v3";
  const CONFIG = Object.freeze({
    supabaseUrl: "https://fvzoogbdezueswyihxiz.supabase.co",
    anonKey: "sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ",
    adminEndpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/admin-teacher-applications",
    repairEndpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/teacher-export-repair"
  });

  let client;
  let session = null;
  let candidates = [];
  let currentApplicationId = "";
  let rendererPromise = null;
  let backgroundObjectUrl = "";
  let panel;
  let stateChip;
  let summaryBox;
  let progressBox;
  let scanBtn;
  let repairAllBtn;
  let repairCurrentBtn;

  const versioned = (path) => `${path}${path.includes("?") ? "&" : "?"}v=${RELEASE}`;

  function createPanel() {
    panel = document.createElement("section");
    panel.id = "exportRepairPanel";
    panel.className = "table-card";
    panel.hidden = true;
    panel.style.cssText = "padding:20px;margin-bottom:16px";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
        <div>
          <h2 style="margin:0;color:var(--primary-dark);font-family:Doran,Alyamama,serif">سلامة الاستمارات وإعادة التوليد</h2>
          <p style="margin:5px 0 0;color:var(--muted);max-width:850px">يُنشئ النظام صفحة رسمية واحدة، ثم يبني منها Word وPDF على الخادم. ويمكن إعادة إصدار أي استمارة قديمة أو تالفة وتحديث الملفين الموحّدين تلقائيًا.</p>
        </div>
        <span id="exportRepairState" class="status-chip">جارٍ الفحص…</span>
      </div>
      <div id="exportRepairSummary" style="margin:14px 0;color:var(--muted)"></div>
      <div id="exportRepairProgress" style="display:none;margin:12px 0;padding:12px;border:1px solid #cfe0dd;border-radius:12px;background:#f6fbfa" aria-live="polite"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary" id="exportRepairScan">فحص سلامة الاستمارات</button>
        <button type="button" class="btn btn-primary" id="exportRepairAll" disabled>إعادة توليد التالفة ومزامنتها</button>
      </div>`;

    const archivePanel = document.getElementById("masterArchivePanel");
    const stats = document.querySelector("#dashboardView .stats");
    if (archivePanel) archivePanel.insertAdjacentElement("afterend", panel);
    else if (stats) stats.insertAdjacentElement("afterend", panel);
    else document.getElementById("dashboardView")?.prepend(panel);

    stateChip = panel.querySelector("#exportRepairState");
    summaryBox = panel.querySelector("#exportRepairSummary");
    progressBox = panel.querySelector("#exportRepairProgress");
    scanBtn = panel.querySelector("#exportRepairScan");
    repairAllBtn = panel.querySelector("#exportRepairAll");
    scanBtn.addEventListener("click", scanCandidates);
    repairAllBtn.addEventListener("click", repairAllCandidates);

    repairCurrentBtn = document.createElement("button");
    repairCurrentBtn.className = "btn btn-secondary";
    repairCurrentBtn.type = "button";
    repairCurrentBtn.id = "repairCurrentApplication";
    repairCurrentBtn.textContent = "إعادة توليد Word وPDF ومزامنتهما";
    repairCurrentBtn.disabled = true;
    repairCurrentBtn.addEventListener("click", () => currentApplicationId && repairSingle(currentApplicationId));
    document.querySelector(".admin-actions")?.append(repairCurrentBtn);

    const applicationsBody = document.getElementById("applicationsBody");
    if (applicationsBody) {
      new MutationObserver(enhanceRows).observe(applicationsBody, { childList: true, subtree: true });
      enhanceRows();
    }

    document.addEventListener("click", (event) => {
      const view = event.target.closest?.("button[data-id]");
      if (view?.dataset?.id) {
        currentApplicationId = view.dataset.id;
        repairCurrentBtn.disabled = false;
      }
      const repair = event.target.closest?.("button[data-repair-id]");
      if (repair?.dataset?.repairId) {
        event.preventDefault();
        event.stopPropagation();
        repairSingle(repair.dataset.repairId);
      }
    }, true);
  }

  function enhanceRows() {
    document.querySelectorAll("#applicationsBody button[data-id]").forEach((viewButton) => {
      const cell = viewButton.parentElement;
      if (!cell || cell.querySelector("button[data-repair-id]")) return;
      cell.style.display = "flex";
      cell.style.gap = "6px";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "row-btn";
      button.dataset.repairId = viewButton.dataset.id || "";
      button.textContent = "إعادة إصدار";
      button.title = "إنشاء Word وPDF جديدين ومزامنة الملفين الموحّدين";
      cell.append(button);
    });
  }

  async function authorizedFetch(url, options = {}, multipart = false) {
    const token = session?.access_token;
    if (!token) throw new Error("يلزم تسجيل الدخول إلى لوحة الإدارة.");
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      headers: {
        apikey: CONFIG.anonKey,
        Authorization: `Bearer ${token}`,
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      }
    });
    let result = {};
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) throw new Error(result.message || `تعذر تنفيذ العملية (رمز ${response.status}).`);
    return result;
  }

  async function scanCandidates() {
    if (!session) return;
    panel.hidden = false;
    setBusy(true, "جارٍ فحص الاستمارات…");
    stateChip.textContent = "جارٍ الفحص";
    stateChip.className = "status-chip status-under_review";
    try {
      const result = await authorizedFetch(CONFIG.repairEndpoint);
      candidates = Array.isArray(result.candidates) ? result.candidates : [];
      renderSummary(result.summary || {});
    } catch (error) {
      candidates = [];
      stateChip.textContent = "تعذر الفحص";
      stateChip.className = "status-chip status-declined";
      summaryBox.textContent = error?.message || "تعذر فحص الاستمارات.";
    } finally {
      setBusy(false);
    }
  }

  function renderSummary(summary) {
    const total = Number(summary.total || 0);
    const healthy = Number(summary.healthy || 0);
    const needsRepair = Number(summary.needs_repair || candidates.length || 0);
    stateChip.textContent = needsRepair ? `${needsRepair} تحتاج إصلاحًا` : "جميع الاستمارات سليمة";
    stateChip.className = `status-chip ${needsRepair ? "status-under_review" : "status-accepted"}`;
    const examples = candidates.slice(0, 5)
      .map((item) => `${escapeHtml(item.reference_number)} ـ ${escapeHtml(item.full_name)}`)
      .join("<br>");
    summaryBox.innerHTML = `إجمالي الطلبات: <strong>${total}</strong> · سليمة: <strong>${healthy}</strong> · تحتاج إعادة توليد: <strong>${needsRepair}</strong>${examples ? `<div style="margin-top:8px;color:var(--danger)">${examples}${candidates.length > 5 ? `<br>و${candidates.length - 5} استمارات أخرى` : ""}</div>` : ""}`;
    repairAllBtn.disabled = needsRepair === 0;
  }

  function setBusy(busy, label = "") {
    scanBtn.disabled = busy;
    repairAllBtn.disabled = busy || candidates.length === 0;
    if (busy) {
      repairAllBtn.dataset.originalText ||= repairAllBtn.textContent;
      repairAllBtn.textContent = label || "جارٍ إعادة التوليد…";
    } else {
      repairAllBtn.textContent = repairAllBtn.dataset.originalText || "إعادة توليد التالفة ومزامنتها";
    }
  }

  function showProgress(text, type = "info") {
    progressBox.style.display = "block";
    progressBox.style.color = type === "error" ? "var(--danger)" : type === "success" ? "var(--success)" : "var(--primary-dark)";
    progressBox.textContent = text;
  }

  async function repairAllCandidates() {
    if (!candidates.length) return;
    if (!window.confirm(`سيُعاد توليد ${candidates.length} استمارة، ثم يُحدَّث ملف Word الموحد وملف PDF الموحد. هل تريد المتابعة؟`)) return;
    setBusy(true, "جارٍ إصلاح الاستمارات…");
    let succeeded = 0;
    const failures = [];
    const queue = [...candidates];
    try {
      await ensureRenderer();
      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        showProgress(`جارٍ معالجة ${index + 1} من ${queue.length}: ${item.full_name} (${item.reference_number})`);
        try {
          await repairOne(item.id);
          succeeded += 1;
        } catch (error) {
          failures.push(`${item.reference_number}: ${error?.message || "تعذر الإصلاح"}`);
        }
      }
      if (succeeded) {
        window.dispatchEvent(new CustomEvent("tallam:archive-refresh", { detail: { repaired: succeeded } }));
        document.getElementById("refreshBtn")?.click();
      }
      showProgress(
        failures.length
          ? `نجح إصلاح ${succeeded} استمارة، وتعذر إصلاح ${failures.length}: ${failures.slice(0, 3).join(" | ")}`
          : `تم إصلاح ${succeeded} استمارة، وبدأ تحديث الملفين الموحّدين ومزامنتهما.`,
        failures.length ? "error" : "success"
      );
      await scanCandidates();
    } finally {
      setBusy(false);
    }
  }

  async function repairSingle(id) {
    if (!id) return;
    const original = repairCurrentBtn?.textContent;
    if (repairCurrentBtn) {
      repairCurrentBtn.disabled = true;
      repairCurrentBtn.textContent = "جارٍ إعادة التوليد…";
    }
    showProgress("جارٍ تحميل بيانات الطلب والصورة والتوقيع وإنشاء ملفات جديدة…");
    try {
      await ensureRenderer();
      const result = await repairOne(id);
      showProgress(`تم إنشاء Word وPDF جديدين للطلب ${result.application?.reference_number || ""}، وبدأ تحديث الملفين الموحّدين.`, "success");
      window.dispatchEvent(new CustomEvent("tallam:archive-refresh", { detail: { repaired: 1 } }));
      document.getElementById("refreshBtn")?.click();
      await scanCandidates();
    } catch (error) {
      showProgress(error?.message || "تعذر إعادة توليد الاستمارة.", "error");
    } finally {
      if (repairCurrentBtn) {
        repairCurrentBtn.disabled = false;
        repairCurrentBtn.textContent = original || "إعادة توليد Word وPDF ومزامنتهما";
      }
    }
  }

  async function repairOne(id) {
    const detail = await authorizedFetch(`${CONFIG.adminEndpoint}?id=${encodeURIComponent(id)}`);
    const app = detail.application;
    if (!app) throw new Error("تعذر تحميل بيانات الطلب.");
    const signatureBlob = await fetchBlob(app.signature_url, "التوقيع الإلكتروني");
    const photoAttachment = (app.attachments || []).find((item) => item.field === "personal_photo");
    const photoBlob = photoAttachment?.signed_url ? await fetchBlob(photoAttachment.signed_url, "الصورة الشخصية") : null;
    if (app.gender === "ذكر" && !photoBlob) throw new Error("الصورة الشخصية غير موجودة في مرفقات الطلب.");

    const rendered = await window.TallamMinistryPreviewRenderer.generate({
      values: valuesFromApplication(app),
      photoFile: photoBlob,
      signatureBlob
    });
    const data = new FormData();
    data.append("application_id", app.id);
    data.append("client_integrity", JSON.stringify(rendered.integrity || {}));
    data.append("ministry_form_preview", rendered.previewPngBlob, `${app.reference_number}.png`);
    return authorizedFetch(CONFIG.repairEndpoint, { method: "POST", body: data }, true);
  }

  function valuesFromApplication(app) {
    return {
      full_name: app.full_name,
      identity_number: app.identity_number,
      identity_type: app.identity_type,
      identity_expiry: app.identity_expiry,
      nationality: app.nationality,
      gender: app.gender,
      birth_place_date: app.birth_place_date,
      qualification: app.qualification,
      specialization: app.specialization,
      workplace: app.workplace,
      job_title: app.job_title,
      phone: app.phone,
      mobile: app.mobile,
      city: app.city,
      region: app.region,
      district: app.district,
      street: app.street,
      building_number: app.building_number,
      apartment_number: app.apartment_number,
      twitter: app.twitter,
      facebook: app.facebook,
      email: app.email
    };
  }

  async function fetchBlob(url, label) {
    if (!url) throw new Error(`${label} غير متاح.`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`تعذر تنزيل ${label} (${response.status}).`);
    const blob = await response.blob();
    if (!blob.size) throw new Error(`${label} فارغ أو تالف.`);
    return blob;
  }

  async function ensureRenderer() {
    if (window.TallamMinistryPreviewRenderer?.build === EXPORT_VERSION) return window.TallamMinistryPreviewRenderer;
    if (rendererPromise) return rendererPromise;
    rendererPromise = (async () => {
      window.__TallamMinistryBackgroundParts = [];
      for (let index = 1; index <= 14; index += 1) {
        await loadScript(`../assets/js/ministry-bg-${String(index).padStart(2, "0")}.js`);
      }
      await loadScript("../assets/js/ministry-background.js");
      await prepareOfficialBackground();
      await loadScript("../assets/js/ministry-preview-renderer.js");
      if (window.TallamMinistryPreviewRenderer?.build !== EXPORT_VERSION) throw new Error("تعذر تحميل محرك إعادة توليد الاستمارات.");
      return window.TallamMinistryPreviewRenderer;
    })();
    try { return await rendererPromise; } catch (error) { rendererPromise = null; throw error; }
  }

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const src = new URL(versioned(path), location.href).href;
      const existing = [...document.scripts].find((script) => script.src === src);
      if (existing?.dataset.loaded === "true") return resolve();
      const script = existing || document.createElement("script");
      if (!existing) {
        script.src = src;
        script.async = false;
        document.body.append(script);
      }
      script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
      script.addEventListener("error", () => reject(new Error(`تعذر تحميل ${path}.`)), { once: true });
    });
  }

  async function prepareOfficialBackground() {
    const source = window.TallamOfficialMinistryBackground;
    if (!String(source || "").startsWith("data:image/webp;base64,")) throw new Error("خلفية الاستمارة الرسمية غير مكتملة.");
    const image = await loadImage(source);
    if (image.naturalWidth !== 1414 || image.naturalHeight !== 2000) throw new Error("أبعاد خلفية الاستمارة الرسمية غير صحيحة.");
    const canvas = document.createElement("canvas");
    canvas.width = 1414;
    canvas.height = 2000;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("تعذر تجهيز خلفية الاستمارة الرسمية.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value && value.size > 20_000 ? resolve(value) : reject(new Error("تعذر تحويل خلفية الاستمارة إلى PNG.")), "image/png"));
    if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
    backgroundObjectUrl = URL.createObjectURL(blob);
    window.TallamOfficialMinistryBackground = backgroundObjectUrl;
    window.addEventListener("pagehide", () => backgroundObjectUrl && URL.revokeObjectURL(backgroundObjectUrl), { once: true });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("تعذر قراءة خلفية الاستمارة الرسمية."));
      image.decoding = "async";
      image.src = source;
    });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[character]));
  }

  async function initialize(nextSession) {
    session = nextSession;
    if (!session) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    await scanCandidates();
  }

  async function init() {
    createPanel();
    if (!window.supabase?.createClient) return;
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { headers: { "x-client-info": `tallam-export-repair/${RELEASE}` } }
    });
    const { data } = await client.auth.getSession();
    await initialize(data.session);
    client.auth.onAuthStateChange((_event, nextSession) => initialize(nextSession));
  }

  init().catch((error) => console.error("Export repair UI initialization failed", error));
})();
