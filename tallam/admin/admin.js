(() => {
  "use strict";

  const CONFIG = Object.freeze({
    supabaseUrl: "https://fvzoogbdezueswyihxiz.supabase.co",
    anonKey: "sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ",
    endpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/admin-teacher-applications",
    firstAdminEmail: "Mad3@tallam.sa"
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

  let client;
  let session = null;
  let page = 1;
  let pages = 1;
  let currentId = null;
  let currentReference = "";
  let currentRows = [];
  let searchTimer = null;
  let magicLinkBtn;
  let deleteApplicationBtn;

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
      session = data.session;
      showDashboard();
      await loadApplications();
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
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true }
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
    applicationsBody.innerHTML = `<tr><td colspan="9" class="empty">جارٍ تحميل الطلبات…</td></tr>`;
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
  }

  async function openApplication(id) {
    clearMessage(dashboardMessage);
    detailModal.classList.add("show");
    document.getElementById("detailTitle").textContent = "جارٍ تحميل الطلب…";
    detailGrid.innerHTML = `<div class="empty" style="grid-column:1/-1">يرجى الانتظار…</div>`;
    attachmentsGrid.innerHTML = "";
    deleteApplicationBtn.disabled = true;
    currentId = null;
    currentReference = "";
    try {
      const result = await authorizedFetch(`${CONFIG.endpoint}?id=${encodeURIComponent(id)}`);
      const app = result.application;
      currentId = app.id;
      currentReference = app.reference_number;
      deleteApplicationBtn.disabled = false;
      document.getElementById("detailTitle").textContent = `${app.full_name} ـ ${app.reference_number}`;
      detailStatus.value = app.status;
      internalNotes.value = app.internal_notes || "";
      const fields = [
        ["الاسم", app.full_name], ["الرقم المرجعي", app.reference_number], ["نوع الطلب", app.registration_type],
        ["الهوية", app.identity_number], ["نوع الهوية", app.identity_type], ["انتهاء الهوية", app.identity_expiry],
        ["الجنسية", app.nationality], ["الجنس", app.gender], ["الميلاد", app.birth_place_date],
        ["المؤهل", app.qualification], ["التخصص", app.specialization], ["مكان العمل", app.workplace],
        ["المسمى", app.job_title], ["المسجد", app.mosque], ["الفترة", app.period],
        ["نوع الحلقة", app.circle_type], ["الهاتف", app.phone], ["الجوال", `0${app.mobile}`],
        ["البريد", app.email], ["المدينة", app.city], ["الحي", app.district],
        ["الشارع", app.street], ["الآيبان", app.iban], ["البنك", app.bank],
        ["صاحب الحساب", app.account_holder], ["مقدار الحفظ", app.quran_memorization], ["الإسناد", app.has_sanad ? "نعم" : "لا"],
        ["الرواية", app.reading_narration], ["الخبرة", `${app.experience_years} سنة`], ["جهات سابقة", app.previous_entities],
        ["الحالة", statusLabels[app.status] || app.status], ["التقديم", formatDate(app.created_at)], ["مكرر محتمل", app.possible_duplicate ? "نعم" : "لا"],
        ["نسخ OneDrive", oneDriveLabels[app.onedrive_backup_status] || app.onedrive_backup_status || "غير مسجل"],
        ["مجلد Word", app.onedrive_word_path], ["مجلد PDF", app.onedrive_pdf_path],
        ["آخر نسخ إلى OneDrive", formatDate(app.onedrive_backed_up_at)], ["خطأ OneDrive", app.onedrive_backup_error]
      ];
      detailGrid.innerHTML = fields.map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`).join("");

      const attachments = app.attachments || [];
      attachmentsGrid.innerHTML = attachments.length
        ? attachments.map((item) => `<div class="attachment"><strong>${escapeHtml(item.label || item.field)}</strong><span>${escapeHtml(item.original_name || "ملف")}</span><br>${item.signed_url ? `<a href="${escapeHtml(item.signed_url)}" target="_blank" rel="noopener">تنزيل المرفق</a>` : "الرابط غير متاح"}</div>`).join("")
        : `<div class="empty" style="grid-column:1/-1">لا توجد مرفقات.</div>`;
      if (app.signature_url) {
        attachmentsGrid.insertAdjacentHTML("beforeend", `<div class="attachment"><strong>التوقيع الإلكتروني</strong><a href="${escapeHtml(app.signature_url)}" target="_blank" rel="noopener">عرض التوقيع</a></div>`);
      }
    } catch (error) {
      detailGrid.innerHTML = `<div class="empty" style="grid-column:1/-1">${escapeHtml(error?.message || "تعذر تحميل الطلب.")}</div>`;
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
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data } = await client.auth.getSession();
    session = data.session;
    if (session) {
      showDashboard();
      await loadApplications();
    } else {
      showLogin();
    }

    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      if (!session) showLogin();
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

  init().then(() => {
    magicLinkBtn?.addEventListener("click", sendMagicLink);
    deleteApplicationBtn?.addEventListener("click", deleteCurrent);
  });
})();
