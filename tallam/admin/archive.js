(() => {
  "use strict";

  const CONFIG = Object.freeze({
    supabaseUrl: "https://fvzoogbdezueswyihxiz.supabase.co",
    anonKey: "sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ",
    archiveEndpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/teacher-application-archive",
    wordName: "جميع استمارات المعلمين.docx",
    pdfName: "جميع استمارات المعلمين.pdf",
    directoryDb: "tallam-teachers-local-storage",
    directoryStore: "handles",
    directoryKey: "onedrive-directory"
  });

  let client;
  let session = null;
  let archive = null;
  let panel;
  let statusText;
  let detailsText;
  let rebuildBtn;
  let wordBtn;
  let pdfBtn;
  let folderBtn;
  let unlinkFolderBtn;

  function createPanel() {
    panel = document.createElement("section");
    panel.id = "masterArchivePanel";
    panel.className = "table-card";
    panel.hidden = true;
    panel.style.cssText = "padding:20px;margin-bottom:16px";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
        <div>
          <h2 style="margin:0;color:var(--primary-dark);font-family:Doran,Alyamama,serif">الملفان الموحّدان لجميع الاستمارات</h2>
          <p style="margin:4px 0 0;color:var(--muted)">تُجمع كل استمارة في صفحة مستقلة داخل ملف Word واحد وملف PDF واحد، ويُستبدل الملفان عند التحديث بدل إنشاء ملفات جديدة.</p>
        </div>
        <span id="masterArchiveState" class="status-chip">جارٍ التحقق…</span>
      </div>
      <div id="masterArchiveDetails" style="margin:14px 0;color:var(--muted)"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn btn-primary" id="masterArchiveRebuild">تحديث الملفين الموحّدين</button>
        <button type="button" class="btn btn-secondary" id="masterArchiveWord" disabled>تنزيل Word الموحّد</button>
        <button type="button" class="btn btn-secondary" id="masterArchivePdf" disabled>تنزيل PDF الموحّد</button>
        <button type="button" class="btn btn-secondary" id="masterArchiveFolder">اختيار مجلد OneDrive وحفظ الملفين</button>
        <button type="button" class="btn btn-danger" id="masterArchiveUnlink" hidden>إلغاء ربط المجلد</button>
      </div>
      <p id="masterArchiveHint" style="margin:12px 0 0;color:var(--muted);font-size:.88rem"></p>`;

    const stats = document.querySelector("#dashboardView .stats");
    if (stats) stats.insertAdjacentElement("afterend", panel);
    else document.getElementById("dashboardView")?.prepend(panel);

    statusText = panel.querySelector("#masterArchiveState");
    detailsText = panel.querySelector("#masterArchiveDetails");
    rebuildBtn = panel.querySelector("#masterArchiveRebuild");
    wordBtn = panel.querySelector("#masterArchiveWord");
    pdfBtn = panel.querySelector("#masterArchivePdf");
    folderBtn = panel.querySelector("#masterArchiveFolder");
    unlinkFolderBtn = panel.querySelector("#masterArchiveUnlink");

    rebuildBtn.addEventListener("click", rebuildArchive);
    wordBtn.addEventListener("click", () => downloadArchive("docx"));
    pdfBtn.addEventListener("click", () => downloadArchive("pdf"));
    folderBtn.addEventListener("click", chooseAndSaveDirectory);
    unlinkFolderBtn.addEventListener("click", unlinkDirectory);

    const hint = panel.querySelector("#masterArchiveHint");
    if (!("showDirectoryPicker" in window)) {
      folderBtn.hidden = true;
      hint.textContent = "الحفظ المباشر داخل مجلد OneDrive متاح من Chrome أو Edge على جهاز الكمبيوتر. ويمكن تنزيل الملفين يدويًا من الزرين أعلاه.";
    } else {
      hint.textContent = "للحفظ في OneDrive دون إعداد Microsoft Graph: اختر مرة واحدة مجلدًا داخل OneDrive على جهازك؛ وبعدها سيحفظ النظام الملفين بالاسم نفسه ويستبدلهما عند كل تحديث.";
    }
  }

  function setBusy(busy, label = "") {
    rebuildBtn.disabled = busy;
    folderBtn.disabled = busy;
    if (busy) {
      rebuildBtn.dataset.originalText ||= rebuildBtn.textContent;
      rebuildBtn.textContent = label || "جارٍ إنشاء الملفين…";
      statusText.textContent = "جارٍ التحديث";
      statusText.className = "status-chip status-under_review";
    } else {
      rebuildBtn.textContent = rebuildBtn.dataset.originalText || "تحديث الملفين الموحّدين";
    }
  }

  function formatDate(value) {
    if (!value) return "لم يُنشأ بعد";
    try {
      return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch {
      return String(value);
    }
  }

  function formatSize(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "—";
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} م.ب` : `${Math.ceil(bytes / 1024)} ك.ب`;
  }

  async function authorizedFetch(url, options = {}) {
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("يلزم تسجيل الدخول إلى لوحة الإدارة.");
    const response = await fetch(url, {
      ...options,
      headers: {
        apikey: CONFIG.anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    let result = {};
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) throw new Error(result.message || `تعذر تنفيذ العملية (رمز ${response.status}).`);
    return result;
  }

  async function loadArchive(ensure = false) {
    if (!session) return;
    panel.hidden = false;
    statusText.textContent = "جارٍ التحقق…";
    detailsText.textContent = "";
    try {
      const result = await authorizedFetch(`${CONFIG.archiveEndpoint}${ensure ? "?ensure=1" : ""}`);
      archive = result.archive || null;
      renderArchive();
      if (ensure && archive?.generation_status === "ready") await autoSaveToLinkedDirectory();
    } catch (error) {
      archive = null;
      statusText.textContent = "تعذر التحميل";
      statusText.className = "status-chip status-declined";
      detailsText.textContent = error?.message || "تعذر تحميل حالة الملفين الموحّدين.";
      wordBtn.disabled = true;
      pdfBtn.disabled = true;
    }
  }

  function renderArchive() {
    if (!archive) return;
    const ready = archive.generation_status === "ready";
    const stale = archive.generation_status === "stale";
    const failed = archive.generation_status === "failed";
    statusText.textContent = ready ? "محدّث" : stale ? "يحتاج تحديثًا" : failed ? "تعذر الإنشاء" : archive.generation_status || "غير جاهز";
    statusText.className = `status-chip ${ready ? "status-accepted" : stale ? "status-under_review" : "status-declined"}`;
    const skipped = Array.isArray(archive.skipped_references) ? archive.skipped_references.length : 0;
    detailsText.innerHTML = `عدد الاستمارات المدرجة: <strong>${Number(archive.application_count || 0)}</strong> · آخر تحديث: <strong>${formatDate(archive.generated_at)}</strong> · Word: <strong>${formatSize(archive.docx_size)}</strong> · PDF: <strong>${formatSize(archive.pdf_size)}</strong>${skipped ? ` · <span style="color:var(--danger)">مستبعدة لقدم الإصدار: ${skipped}</span>` : ""}${archive.last_error ? `<br><span style="color:var(--danger)">${escapeHtml(archive.last_error)}</span>` : ""}`;
    wordBtn.disabled = !ready || !archive.docx_url;
    pdfBtn.disabled = !ready || !archive.pdf_url;
    refreshDirectoryUi();
  }

  async function rebuildArchive() {
    setBusy(true);
    try {
      const result = await authorizedFetch(CONFIG.archiveEndpoint, { method: "POST", body: "{}" });
      archive = result.archive;
      renderArchive();
      await autoSaveToLinkedDirectory();
      showDashboardMessage("تم تحديث ملف Word الموحد وملف PDF الموحد بنجاح.", "success");
    } catch (error) {
      showDashboardMessage(error?.message || "تعذر إنشاء الملفين الموحدين.", "error");
      await loadArchive(false);
    } finally {
      setBusy(false);
    }
  }

  function downloadArchive(kind) {
    const url = kind === "docx" ? archive?.docx_url : archive?.pdf_url;
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = kind === "docx" ? CONFIG.wordName : CONFIG.pdfName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function chooseAndSaveDirectory() {
    if (!("showDirectoryPicker" in window)) return;
    try {
      const handle = await window.showDirectoryPicker({ id: "tallam-teacher-forms", mode: "readwrite", startIn: "documents" });
      await storeDirectoryHandle(handle);
      unlinkFolderBtn.hidden = false;
      await ensureArchiveReady();
      await writeArchiveFiles(handle);
      showDashboardMessage("تم حفظ الملفين داخل المجلد المختار. إذا كان المجلد داخل OneDrive فستتم مزامنتهما تلقائيًا.", "success");
      refreshDirectoryUi();
    } catch (error) {
      if (error?.name !== "AbortError") showDashboardMessage(error?.message || "تعذر اختيار المجلد أو حفظ الملفين.", "error");
    }
  }

  async function autoSaveToLinkedDirectory() {
    if (!("showDirectoryPicker" in window) || !archive?.docx_url || !archive?.pdf_url) return;
    const handle = await getDirectoryHandle();
    if (!handle) return;
    try {
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") return;
      await writeArchiveFiles(handle);
      showDashboardMessage("حُدّث الملفان الموحّدان تلقائيًا داخل مجلد OneDrive المرتبط بهذا الجهاز.", "success");
    } catch (error) {
      console.warn("Automatic OneDrive-folder save failed", error);
    }
  }

  async function ensureArchiveReady() {
    if (archive?.generation_status === "ready" && archive.docx_url && archive.pdf_url) return;
    const result = await authorizedFetch(CONFIG.archiveEndpoint, { method: "POST", body: "{}" });
    archive = result.archive;
    renderArchive();
  }

  async function writeArchiveFiles(directoryHandle) {
    const permission = await requestWritePermission(directoryHandle);
    if (permission !== "granted") throw new Error("لم تُمنح صلاحية الكتابة في المجلد المختار.");
    const [wordResponse, pdfResponse] = await Promise.all([
      fetch(archive.docx_url, { cache: "no-store" }),
      fetch(archive.pdf_url, { cache: "no-store" })
    ]);
    if (!wordResponse.ok || !pdfResponse.ok) throw new Error("تعذر تنزيل أحد الملفين الموحدين قبل حفظه في المجلد.");
    const [wordBlob, pdfBlob] = await Promise.all([wordResponse.blob(), pdfResponse.blob()]);
    await Promise.all([
      writeFile(directoryHandle, CONFIG.wordName, wordBlob),
      writeFile(directoryHandle, CONFIG.pdfName, pdfBlob)
    ]);
  }

  async function writeFile(directoryHandle, name, blob) {
    const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
  }

  async function requestWritePermission(handle) {
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return "granted";
    return handle.requestPermission({ mode: "readwrite" });
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.directoryDb, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(CONFIG.directoryStore);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeDirectoryHandle(handle) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.directoryStore, "readwrite");
      transaction.objectStore(CONFIG.directoryStore).put(handle, CONFIG.directoryKey);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  async function getDirectoryHandle() {
    try {
      const db = await openDb();
      const handle = await new Promise((resolve, reject) => {
        const request = db.transaction(CONFIG.directoryStore, "readonly").objectStore(CONFIG.directoryStore).get(CONFIG.directoryKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return handle;
    } catch {
      return null;
    }
  }

  async function unlinkDirectory() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.directoryStore, "readwrite");
      transaction.objectStore(CONFIG.directoryStore).delete(CONFIG.directoryKey);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    unlinkFolderBtn.hidden = true;
    folderBtn.textContent = "اختيار مجلد OneDrive وحفظ الملفين";
    showDashboardMessage("أُلغي ربط مجلد OneDrive من هذا الجهاز.", "success");
  }

  async function refreshDirectoryUi() {
    if (!("showDirectoryPicker" in window)) return;
    const handle = await getDirectoryHandle();
    unlinkFolderBtn.hidden = !handle;
    folderBtn.textContent = handle ? "حفظ الملفين في مجلد OneDrive المرتبط" : "اختيار مجلد OneDrive وحفظ الملفين";
  }

  function showDashboardMessage(text, type) {
    const box = document.getElementById("dashboardMessage");
    if (!box) return;
    box.textContent = text;
    box.className = `admin-message show ${type === "success" ? "success" : "error"}`;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[character]));
  }

  async function initializeForSession(nextSession) {
    session = nextSession;
    if (!session) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    await loadArchive(true);
  }

  async function init() {
    createPanel();
    if (!window.supabase?.createClient) return;
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { headers: { "x-client-info": "tallam-admin-archive/1.0" } }
    });
    const { data } = await client.auth.getSession();
    await initializeForSession(data.session);
    client.auth.onAuthStateChange((_event, nextSession) => initializeForSession(nextSession));
  }

  init().catch((error) => console.error("Archive UI initialization failed", error));
})();
