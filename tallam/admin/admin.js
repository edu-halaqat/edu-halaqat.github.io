(() => {
  "use strict";

  const CONFIG = Object.freeze({
    supabaseUrl: "https://fvzoogbdezueswyihxiz.supabase.co",
    anonKey: "sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ",
    endpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/admin-teacher-applications",
    revisionEndpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/teacher-application-revision-admin",
    exportEndpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/teacher-applications-export",
    firstAdminEmail: "Mad3@tallam.sa",
    authStorageKey: "tallam-admin-auth-v1"
  });

  const statusLabels = {
    new: "جديد", under_review: "تحت المراجعة", needs_completion: "يحتاج استكمالًا",
    interview: "مقابلة", accepted: "مقبول", declined: "معتذر عنه", archived: "مؤرشف"
  };

  const oneDriveLabels = {
    completed: "محفوظ في OneDrive",
    pending: "بانتظار النسخ إلى OneDrive",
    processing: "جارٍ النسخ إلى OneDrive",
    failed: "تعذر النسخ إلى OneDrive",
    not_configured: "اتصال OneDrive غير مفعّل"
  };

  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");
  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");
  const loginEmail = document.getElementById("loginEmail");
  const loginMessage = document.getElementById("loginMessage");
  const dashboardMessage = document.getElementById("dashboardMessage");
  const applicationsBody = document.getElementById("applicationsBody");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const refreshBtn = document.getElementById("refreshBtn");
  const prevPage = document.getElementById("prevPage");
  const nextPage = document.getElementById("nextPage");
  const pageLabel = document.getElementById("pageLabel");
  const detailModal = document.getElementById("detailModal");
  const detailGrid = document.getElementById("detailGrid");
  const attachmentsGrid = document.getElementById("attachmentsGrid");
  const detailStatus = document.getElementById("detailStatus");
  const internalNotes = document.getElementById("internalNotes");
  const saveApplication = document.getElementById("saveApplication");
  const selectAllApplications = document.getElementById("selectAllApplications");
  const exportSelectedExcel = document.getElementById("exportSelectedExcel");
  const printSelectedReport = document.getElementById("printSelectedReport");
  const exportAllExcel = document.getElementById("exportAllExcel");

  let client;
  let session = null;
  let page = 1;
  let pages = 1;
  let currentId = null;
  let currentReference = "";
  let currentRows = [];
  let searchTimer = null;
  const selectedIds = new Set();
  let magicLinkBtn;
  let deleteApplicationBtn;
  let whatsappRevisionBtn;

  function installEnhancements() {
    loginEmail.value = CONFIG.firstAdminEmail;
    loginEmail.placeholder = "البريد الإلكتروني المخوّل";

    magicLinkBtn = document.createElement("button");
    magicLinkBtn.className = "btn btn-secondary";
    magicLinkBtn.type = "button";
    magicLinkBtn.style.width = "100%";
    magicLinkBtn.style.marginTop = "10px";
    magicLinkBtn.textContent = "إرسال رابط دخول إلى البريد";
    loginBtn.insertAdjacentElement("afterend", magicLinkBtn);

    const help = document.createElement("p");
    help.style.cssText = "text-align:center;color:var(--muted);font-size:.86rem;margin:10px 0 0";
    help.textContent = "للدخول أول مرة دون كلمة مرور، استخدم رابط الدخول المرسل إلى البريد المخوّل.";
    magicLinkBtn.insertAdjacentElement("afterend", help);

    deleteApplicationBtn = document.createElement("button");
    deleteApplicationBtn.className = "btn btn-danger";
    deleteApplicationBtn.type = "button";
    deleteApplicationBtn.textContent = "حذف الطلب نهائيًا";
    document.querySelector(".admin-actions")?.append(deleteApplicationBtn);

    whatsappRevisionBtn = document.createElement("button");
    whatsappRevisionBtn.className = "btn btn-primary";
    whatsappRevisionBtn.type = "button";
    whatsappRevisionBtn.textContent = "إعادة للمعلم عبر واتساب";
    whatsappRevisionBtn.style.background = "#25D366";
    whatsappRevisionBtn.style.borderColor = "#25D366";
    document.querySelector(".admin-actions")?.prepend(whatsappRevisionBtn);
  }

  function message(element, text, type = "error") {
    element.textContent = text;
    element.className = `admin-message show ${type}`;
  }

  function clearMessage(element) {
    element.textContent = "";
    element.className = "admin-message";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch {
      return value;
    }
  }

  async function authorizedFetch(url, options = {}) {
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("يلزم تسجيل الدخول.");
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
    if (response.status === 401) {
      await client.auth.signOut();
      showLogin();
      throw new Error("انتهت جلسة الدخول. يرجى تسجيل الدخول مجددًا.");
    }
    if (!response.ok) throw new Error(result.message || `تعذر تنفيذ الطلب (رمز ${response.status}).`);
    return result;
  }

  function showLogin() {
    session = null;
    loginView.hidden = false;
    dashboardView.hidden = true;
    detailModal.classList.remove("show");
  }

  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
  }

  async function verifyAdminSession(candidateSession = session) {
    const accessToken = candidateSession?.access_token;
    if (!accessToken) throw new Error("يلزم تسجيل الدخول.");
    const response = await fetch(`${CONFIG.endpoint}?page=1&limit=1`, {
      headers: {
        apikey: CONFIG.anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });
    let result = {};
    try { result = await response.json(); } catch { result = {}; }
    if (response.status === 403) throw new Error("هذا الحساب غير مخوّل لإدارة طلبات المعلمين.");
    if (response.status === 401) throw new Error("انتهت جلسة الدخول أو لم تعد صالحة.");
    if (!response.ok) throw new Error(result.message || `تعذر التحقق من الصلاحية (رمز ${response.status}).`);
    return result;
  }

  async function activateAuthorizedSession(candidateSession) {
    session = candidateSession;
    if (!session) {
      showLogin();
      return false;
    }
    try {
      await verifyAdminSession(session);
      showDashboard();
      await loadApplications();
      return true;
    } catch (error) {
      session = null;
      showLogin();
      message(loginMessage, error?.message || "هذا الحساب غير مخوّل لإدارة الطلبات.");
      try { await client.auth.signOut({ scope: "local" }); } catch {}
      return false;
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearMessage(loginMessage);
    loginBtn.disabled = true;
    loginBtn.textContent = "جارٍ الدخول…";
    try {
      const email = loginEmail.value.trim();
      const password = document.getElementById("loginPassword").value;
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const ok = await activateAuthorizedSession(data.session);
      if (!ok) return;
    } catch (error) {
      message(loginMessage, error?.message || "تعذر تسجيل الدخول.");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "تسجيل الدخول";
    }
  }

  async function sendMagicLink() {
    clearMessage(loginMessage);
    const email = loginEmail.value.trim();
    if (!email || !loginEmail.checkValidity()) {
      message(loginMessage, "أدخل بريدًا إلكترونيًا صحيحًا أولًا.");
      loginEmail.focus();
      return;
    }
    magicLinkBtn.disabled = true;
    magicLinkBtn.textContent = "جارٍ إرسال الرابط…";
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
      });
      if (error) throw error;
      message(loginMessage, `أُرسل رابط دخول آمن إلى ${email}. افتح الرسالة واضغط الرابط لإتمام التفعيل.`, "success");
    } catch (error) {
      message(loginMessage, error?.message || "تعذر إرسال رابط الدخول.");
    } finally {
      magicLinkBtn.disabled = false;
      magicLinkBtn.textContent = "إرسال رابط دخول إلى البريد";
    }
  }

  async function loadApplications() {
    clearMessage(dashboardMessage);
    refreshBtn.disabled = true;
    applicationsBody.innerHTML = `<tr><td colspan="10" class="empty">جارٍ تحميل الطلبات…</td></tr>`;
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    const query = searchInput.value.trim();
    const status = statusFilter.value;
    if (query) params.set("search", query);
    if (status) params.set("status", status);

    try {
      const result = await authorizedFetch(`${CONFIG.endpoint}?${params}`);
      currentRows = result.applications || [];
      page = result.pagination?.page || 1;
      pages = result.pagination?.pages || 1;
      document.getElementById("adminName").textContent = result.admin?.display_name || session?.user?.email || "مدير الطلبات";
      renderRows();
      document.getElementById("statTotal").textContent = result.pagination?.total || 0;
      document.getElementById("statPage").textContent = page;
      document.getElementById("statNew").textContent = currentRows.filter((row) => row.status === "new").length;
      document.getElementById("statDuplicate").textContent = currentRows.filter((row) => row.possible_duplicate).length;
      pageLabel.textContent = `${page} / ${pages}`;
      prevPage.disabled = page <= 1;
      nextPage.disabled = page >= pages;
    } catch (error) {
      applicationsBody.innerHTML = "";
      emptyState.hidden = false;
      message(dashboardMessage, error?.message || "تعذر تحميل الطلبات.");
    } finally {
      refreshBtn.disabled = false;
    }
  }

  function renderRows() {
    emptyState.hidden = currentRows.length > 0;
    applicationsBody.innerHTML = currentRows.map((row) => `
      <tr>
        <td><input class="row-select" type="checkbox" data-select-id="${escapeHtml(row.id)}" ${selectedIds.has(row.id) ? "checked" : ""} aria-label="تحديد ${escapeHtml(row.full_name)}"></td>
        <td dir="ltr">${escapeHtml(row.reference_number)}</td>
        <td>${escapeHtml(row.full_name)}</td>
        <td dir="ltr">${escapeHtml(row.identity_number_masked || "—")}</td>
        <td dir="ltr">${escapeHtml(row.mobile_masked || "—")}</td>
        <td>${escapeHtml(row.registration_type)}</td>
        <td>${escapeHtml(row.mosque)}</td>
        <td><span class="status-chip status-${escapeHtml(row.status)}">${escapeHtml(statusLabels[row.status] || row.status)}</span>${row.possible_duplicate ? " ⚠" : ""}</td>
        <td>${escapeHtml(formatDate(row.created_at))}</td>
        <td><button class="row-btn" type="button" data-id="${escapeHtml(row.id)}">عرض</button></td>
      </tr>`).join("");

    applicationsBody.querySelectorAll("button[data-id]").forEach((button) => {
      button.addEventListener("click", () => openApplication(button.dataset.id));
    });
    applicationsBody.querySelectorAll("input[data-select-id]").forEach((box) => {
      box.addEventListener("change", () => {
        if (box.checked) selectedIds.add(box.dataset.selectId); else selectedIds.delete(box.dataset.selectId);
        syncSelectAll();
      });
    });
    syncSelectAll();
  }

  function syncSelectAll() {
    if (!selectAllApplications) return;
    const ids = currentRows.map((row) => row.id);
    const selectedOnPage = ids.filter((id) => selectedIds.has(id)).length;
    selectAllApplications.checked = ids.length > 0 && selectedOnPage === ids.length;
    selectAllApplications.indeterminate = selectedOnPage > 0 && selectedOnPage < ids.length;
  }

  async function fetchExportData(mode) {
    const ids = mode === "selected" ? Array.from(selectedIds) : [];
    if (mode === "selected" && !ids.length) throw new Error("حدد متقدمًا واحدًا على الأقل.");
    const result = await authorizedFetch(CONFIG.exportEndpoint, {
      method: "POST",
      body: JSON.stringify({
        ids,
        search: mode === "all" ? searchInput.value.trim() : "",
        status: mode === "all" ? statusFilter.value : ""
      })
    });
    return result.applications || [];
  }

  const exportColumns = [
    ["reference_number","رقم الطلب"],["full_name","الاسم"],["identity_number","رقم الهوية/الإقامة"],["identity_type","نوع الهوية"],
    ["identity_expiry","انتهاء الهوية"],["nationality","الجنسية"],["gender","الجنس"],["birth_place_date","مكان وتاريخ الميلاد"],
    ["registration_type","نوع التسجيل"],["branch","الفرع"],["qualification","المؤهل"],["specialization","التخصص"],["workplace","مكان العمل"],
    ["educational_entity","الجهة التعليمية"],["job_title","المسمى الوظيفي"],["mosque","المسجد"],["period","الفترة"],["circle_type","نوع الحلقة"],["phone","الهاتف"],["mobile","الجوال"],
    ["email","البريد الإلكتروني"],["city","المدينة"],["region","المنطقة"],["district","الحي"],["street","الشارع"],["building_number","رقم المبنى"],
    ["apartment_number","رقم الشقة"],["twitter","X / تويتر"],["facebook","فيسبوك"],["iban","الآيبان"],["bank","البنك"],["account_holder","صاحب الحساب"],
    ["quran_memorization","مقدار الحفظ"],["has_sanad","سند"],["has_madaniyah","القاعدة المدنية"],["has_nooraniyah","القاعدة النورانية"],
    ["experience_years","سنوات الخبرة"],["reading_narration","الرواية"],["previous_entities","جهات سابقة"],["status","الحالة"],["internal_notes","الملاحظات"],
    ["revision_count","عدد مرات التعديل"],["created_at","تاريخ التقديم"],["updated_at","آخر تحديث"],["attachments","المرفقات"]
  ];

  function exportValue(app, key) {
    if (key === "status") return statusLabels[app.status] || app.status || "";
    if (["has_sanad","has_madaniyah","has_nooraniyah"].includes(key)) return app[key] ? "نعم" : "لا";
    if (key === "attachments") return (Array.isArray(app.attachments) ? app.attachments : []).map((x) => x.label || x.field || x.original_name).filter(Boolean).join("، ");
    if (key === "mobile") return app.mobile ? "0" + app.mobile : "";
    if (["created_at","updated_at"].includes(key)) return app[key] ? formatDate(app[key]) : "";
    return app[key] ?? "";
  }

  function downloadExcel(apps) {
    const rows = [exportColumns.map(([,label]) => label), ...apps.map((app) => exportColumns.map(([key]) => exportValue(app,key)))];
    const table = '<table border="1"><thead><tr>' + rows[0].map((v)=>'<th>'+escapeHtml(v)+'</th>').join("") + '</tr></thead><tbody>' +
      rows.slice(1).map((row)=>'<tr>'+row.map((v)=>'<td>'+escapeHtml(v)+'</td>').join("")+'</tr>').join("") + '</tbody></table>';
    const html = '<!doctype html><html dir="rtl"><head><meta charset="utf-8"></head><body>'+table+'</body></html>';
    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "بيانات_المتقدمين_" + new Date().toISOString().slice(0,10) + ".xls";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function printReport(apps) {
    const w = window.open("", "_blank");
    if (!w) throw new Error("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
    const cards = apps.map((app) => '<section class="app"><h2>'+escapeHtml(app.full_name||"")+' <small>'+escapeHtml(app.reference_number||"")+'</small></h2><div class="grid">' +
      exportColumns.filter(([key])=>key!=="attachments").map(([key,label])=>'<div><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(exportValue(app,key)||"—")+'</strong></div>').join("") +
      '</div><p><b>المرفقات:</b> '+escapeHtml(exportValue(app,"attachments")||"—")+'</p></section>').join("");
    w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير بيانات المتقدمين</title><style>body{font-family:Arial,Tahoma,sans-serif;margin:24px;color:#222}h1{text-align:center}.app{page-break-after:always;border:1px solid #bbb;padding:18px;margin-bottom:18px}.app:last-child{page-break-after:auto}.app h2{margin:0 0 14px}.app small{font-size:.6em;color:#666}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grid div{border:1px solid #ddd;padding:8px}.grid span{display:block;color:#666;font-size:12px}.grid strong{display:block;word-break:break-word}@media print{body{margin:0}.app{border:0}}</style></head><body><h1>تقرير بيانات المتقدمين</h1>'+cards+'</body></html>');
    w.document.close(); w.focus(); setTimeout(()=>w.print(),350);
  }

  async function runExport(kind, mode) {
    const btn = kind === "print" ? printSelectedReport : (mode === "all" ? exportAllExcel : exportSelectedExcel);
    const original = btn?.textContent || "";
    if (btn) { btn.disabled = true; btn.textContent = "جارٍ تجهيز البيانات…"; }
    try {
      const apps = await fetchExportData(mode);
      if (!apps.length) throw new Error("لا توجد بيانات مطابقة للتصدير.");
      if (kind === "print") printReport(apps); else downloadExcel(apps);
      message(dashboardMessage, "تم تجهيز " + apps.length + " طلبًا للمشاركة/التصدير.", "success");
    } catch (error) {
      alert(error?.message || "تعذر تجهيز البيانات.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }
  }

  async function openApplication(id) {
    clearMessage(dashboardMessage);
    detailModal.classList.add("show");
    document.getElementById("detailTitle").textContent = "جارٍ تحميل الطلب…";
    detailGrid.innerHTML = `<div class="empty" style="grid-column:1/-1">يرجى الانتظار…</div>`;
    attachmentsGrid.innerHTML = "";
    deleteApplicationBtn.disabled = true;
    if (whatsappRevisionBtn) whatsappRevisionBtn.disabled = true;
    currentId = id;
    currentReference = "";

    const localRow = currentRows.find((r) => r.id === id) || {};
    let serverApp = {};
    try {
      const result = await authorizedFetch(`${CONFIG.endpoint}?id=${encodeURIComponent(id)}`);
      serverApp = result.application || {};
    } catch (e) {
      // الاعتماد على البيانات المحلية في حال تعذر جلب الخادم التفاصيل الكاملة
    }

    const app = { ...localRow, ...serverApp };
    currentReference = app.reference_number || localRow.reference_number || "";
    deleteApplicationBtn.disabled = !currentId;
    if (whatsappRevisionBtn) whatsappRevisionBtn.disabled = !currentId;

    document.getElementById("detailTitle").textContent = `${app.full_name || localRow.full_name || "الطلب"} ـ ${currentReference}`;
    detailStatus.value = app.status || localRow.status || "new";
    internalNotes.value = app.internal_notes || localRow.internal_notes || "";

    const fields = [
      ["الاسم", app.full_name], ["الرقم المرجعي", app.reference_number], ["نوع الطلب", app.registration_type],
      ["الهوية", app.identity_number || app.identity_number_masked], ["نوع الهوية", app.identity_type], ["انتهاء الهوية", app.identity_expiry],
      ["الجنسية", app.nationality], ["الجنس", app.gender], ["الميلاد", app.birth_place_date],
      ["المؤهل", app.qualification], ["التخصص", app.specialization], ["مكان العمل", app.workplace], ["الجهة التعليمية", app.educational_entity],
      ["المسمى", app.job_title], ["المسجد", app.mosque], ["الفترة", app.period],
      ["نوع الحلقة", app.circle_type], ["الهاتف", app.phone], ["الجوال", app.mobile ? `0${app.mobile}` : (app.mobile_masked || "—")],
      ["البريد", app.email], ["المدينة", app.city], ["الحي", app.district],
      ["الشارع", app.street], ["الآيبان", app.iban], ["البنك", app.bank],
      ["صاحب الحساب", app.account_holder], ["مقدار الحفظ", app.quran_memorization], ["الإسناد", app.has_sanad === true || app.has_sanad === "نعم" ? "نعم" : "لا"],
      ["الرواية", app.reading_narration], ["الخبرة", app.experience_years ? `${app.experience_years} سنة` : "—"], ["جهات سابقة", app.previous_entities],
      ["الحالة", statusLabels[app.status || localRow.status] || app.status || "جديد"], ["التقديم", formatDate(app.created_at || localRow.created_at)], ["مكرر محتمل", app.possible_duplicate ? "نعم" : "لا"],
      ["نسخ OneDrive", oneDriveLabels[app.onedrive_backup_status] || app.onedrive_backup_status || "غير مسجل"],
      ["مجلد Word", app.onedrive_word_path], ["مجلد PDF", app.onedrive_pdf_path],
      ["آخر نسخ إلى OneDrive", formatDate(app.onedrive_backed_up_at)], ["خطأ OneDrive", app.onedrive_backup_error]
    ];
    detailGrid.innerHTML = fields.map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`).join("");

    const attachments = app.attachments || [];
    attachmentsGrid.innerHTML = attachments.length
      ? attachments.map((item) => `<div class="attachment"><strong>${escapeHtml(item.label || item.field)}</strong><span>${escapeHtml(item.original_name || "ملف")}</span><br>${item.signed_url ? `<a href="${escapeHtml(item.signed_url)}" target="_blank" rel="noopener">تنزيل المرفق</a>` : "الرابط غير متاح"}</div>`).join("")
      : `<div class="empty" style="grid-column:1/-1">لا توجد مرفقات مسجلة.</div>`;
      
    if (app.signature_url) {
      attachmentsGrid.insertAdjacentHTML("beforeend", `<div class="attachment"><strong>التوقيع الإلكتروني</strong><a href="${escapeHtml(app.signature_url)}" target="_blank" rel="noopener">عرض التوقيع</a></div>`);
    }
  }

  async function saveCurrent() {
    if (!currentId) return;
    saveApplication.disabled = true;
    saveApplication.textContent = "جارٍ الحفظ…";
    try {
      await authorizedFetch(CONFIG.endpoint, {
        method: "PATCH",
        body: JSON.stringify({ id: currentId, status: detailStatus.value, internal_notes: internalNotes.value.trim() })
      });
      detailModal.classList.remove("show");
      message(dashboardMessage, "تم تحديث حالة الطلب وملاحظاته.", "success");
      await loadApplications();
    } catch (error) {
      alert(error?.message || "تعذر تحديث الطلب.");
    } finally {
      saveApplication.disabled = false;
      saveApplication.textContent = "حفظ التحديث";
    }
  }

  async function sendRevisionByWhatsapp() {
    if (!currentId) return;
    const notes = internalNotes.value.trim();
    if (!notes) {
      alert("اكتب ملاحظات التعديل أولًا، ثم اضغط «إعادة للمعلم عبر واتساب».");
      internalNotes.focus();
      return;
    }
    const whatsappWindow = window.open("about:blank", "_blank");
    whatsappRevisionBtn.disabled = true;
    whatsappRevisionBtn.textContent = "جارٍ تجهيز رسالة واتساب…";
    try {
      const result = await authorizedFetch(CONFIG.revisionEndpoint, {
        method: "POST",
        body: JSON.stringify({ id: currentId, notes })
      });
      if (whatsappWindow) {
        whatsappWindow.location.href = result.whatsapp_url;
      } else {
        window.location.href = result.whatsapp_url;
      }
      detailStatus.value = "needs_completion";
      message(dashboardMessage, "تمت إعادة الطلب للمعلم وفتح رسالة واتساب الجاهزة للإرسال.", "success");
      await loadApplications();
    } catch (error) {
      try { whatsappWindow?.close(); } catch {}
      alert(error?.message || "تعذر إعادة الطلب عبر واتساب.");
    } finally {
      whatsappRevisionBtn.disabled = false;
      whatsappRevisionBtn.textContent = "إعادة للمعلم عبر واتساب";
    }
  }

  async function deleteCurrent() {
    if (!currentId || !currentReference) return;
    const typed = window.prompt(
      `هذا الحذف نهائي ويشمل بيانات الطلب ومرفقاته.\nللتأكيد اكتب الرقم المرجعي كاملًا:\n${currentReference}`,
      ""
    );
    if (typed === null) return;
    if (typed.trim() !== currentReference) {
      alert("الرقم المرجعي غير مطابق؛ لم يُحذف الطلب.");
      return;
    }
    if (!window.confirm("هل تؤكد الحذف النهائي؟ لا يمكن التراجع بعد التنفيذ.")) return;

    deleteApplicationBtn.disabled = true;
    saveApplication.disabled = true;
    deleteApplicationBtn.textContent = "جارٍ الحذف…";
    try {
      const result = await authorizedFetch(CONFIG.endpoint, {
        method: "DELETE",
        body: JSON.stringify({ id: currentId, confirmation_reference: currentReference })
      });
      detailModal.classList.remove("show");
      const cleanup = result.onedrive_cleanup || {};
      if (["failed", "not_configured"].includes(cleanup.status)) {
        message(dashboardMessage, `حُذف الطلب من البوابة ومرفقاته المحلية، لكن تعذر التحقق من حذف نسخة OneDrive: ${cleanup.error || "الاتصال غير متاح"}.`);
      } else {
        message(dashboardMessage, `تم حذف الطلب ${result.deleted?.reference_number || currentReference} ومرفقاته نهائيًا.`, "success");
      }
      currentId = null;
      currentReference = "";
      await loadApplications();
    } catch (error) {
      alert(error?.message || "تعذر حذف الطلب.");
    } finally {
      deleteApplicationBtn.disabled = false;
      saveApplication.disabled = false;
      deleteApplicationBtn.textContent = "حذف الطلب نهائيًا";
    }
  }

  async function init() {
    installEnhancements();
    if (!window.supabase?.createClient) {
      message(loginMessage, "تعذر تحميل خدمة تسجيل الدخول. تحقق من اتصال الإنترنت وأعد تحديث الصفحة.");
      return;
    }
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: CONFIG.authStorageKey
      }
    });
    const { data } = await client.auth.getSession();
    if (data.session) {
      await activateAuthorizedSession(data.session);
    } else {
      showLogin();
    }

    client.auth.onAuthStateChange((event, nextSession) => {
      if (!nextSession) {
        session = null;
        showLogin();
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        activateAuthorizedSession(nextSession);
      }
    });
  }

  loginForm.addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", async () => { await client.auth.signOut(); showLogin(); });
  refreshBtn.addEventListener("click", () => { page = 1; loadApplications(); });
  statusFilter.addEventListener("change", () => { page = 1; loadApplications(); });
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; loadApplications(); }, 450);
  });
  prevPage.addEventListener("click", () => { if (page > 1) { page -= 1; loadApplications(); } });
  nextPage.addEventListener("click", () => { if (page < pages) { page += 1; loadApplications(); } });
  document.getElementById("closeModal").addEventListener("click", () => detailModal.classList.remove("show"));
  detailModal.addEventListener("click", (event) => { if (event.target === detailModal) detailModal.classList.remove("show"); });
  saveApplication.addEventListener("click", saveCurrent);
  selectAllApplications?.addEventListener("change", () => {
    for (const row of currentRows) {
      if (selectAllApplications.checked) selectedIds.add(row.id); else selectedIds.delete(row.id);
    }
    renderRows();
  });
  exportSelectedExcel?.addEventListener("click", () => runExport("excel","selected"));
  printSelectedReport?.addEventListener("click", () => runExport("print","selected"));
  exportAllExcel?.addEventListener("click", () => runExport("excel","all"));

  init().then(() => {
    magicLinkBtn?.addEventListener("click", sendMagicLink);
    deleteApplicationBtn?.addEventListener("click", deleteCurrent);
    whatsappRevisionBtn?.addEventListener("click", sendRevisionByWhatsapp);
  });
})();
