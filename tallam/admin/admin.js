(() => {
  "use strict";

  const CONFIG = Object.freeze({
    supabaseUrl: "https://fvzoogbdezueswyihxiz.supabase.co",
    anonKey: "sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ",
    endpoint: "https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/admin-teacher-applications"
  });

  const statusLabels = {
    new: "جديد", under_review: "تحت المراجعة", needs_completion: "يحتاج استكمالًا",
    interview: "مقابلة", accepted: "مقبول", declined: "معتذر عنه", archived: "مؤرشف"
  };

  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");
  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");
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
  let currentRows = [];
  let searchTimer = null;

  function message(element, text, type = "error") {
    element.textContent = text;
    element.className = `admin-message show ${type}`;
  }

  function clearMessage(element) {
    element.textContent = "";
    element.className = "admin-message";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function formatDate(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
    catch { return value; }
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
      const email = document.getElementById("loginEmail").value.trim();
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

    applicationsBody.querySelectorAll("button[data-id]").forEach((button) => button.addEventListener("click", () => openApplication(button.dataset.id)));
  }

  async function openApplication(id) {
    clearMessage(dashboardMessage);
    detailModal.classList.add("show");
    document.getElementById("detailTitle").textContent = "جارٍ تحميل الطلب…";
    detailGrid.innerHTML = `<div class="empty" style="grid-column:1/-1">يرجى الانتظار…</div>`;
    attachmentsGrid.innerHTML = "";
    try {
      const result = await authorizedFetch(`${CONFIG.endpoint}?id=${encodeURIComponent(id)}`);
      const app = result.application;
      currentId = app.id;
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
        ["الحالة", statusLabels[app.status] || app.status], ["التقديم", formatDate(app.created_at)], ["مكرر محتمل", app.possible_duplicate ? "نعم" : "لا"]
      ];
      detailGrid.innerHTML = fields.map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`).join("");

      const attachments = app.attachments || [];
      attachmentsGrid.innerHTML = attachments.length ? attachments.map((item) => `<div class="attachment"><strong>${escapeHtml(item.label || item.field)}</strong><span>${escapeHtml(item.original_name || "ملف")}</span><br>${item.signed_url ? `<a href="${escapeHtml(item.signed_url)}" target="_blank" rel="noopener">تنزيل المرفق</a>` : "الرابط غير متاح"}</div>`).join("") : `<div class="empty" style="grid-column:1/-1">لا توجد مرفقات.</div>`;
      if (app.signature_url) attachmentsGrid.insertAdjacentHTML("beforeend", `<div class="attachment"><strong>التوقيع الإلكتروني</strong><a href="${escapeHtml(app.signature_url)}" target="_blank" rel="noopener">عرض التوقيع</a></div>`);
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

  async function init() {
    if (!window.supabase?.createClient) {
      message(loginMessage, "تعذر تحميل خدمة تسجيل الدخول. تحقق من اتصال الإنترنت وأعد تحديث الصفحة.");
      return;
    }
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await client.auth.getSession();
    session = data.session;
    if (session) {
      showDashboard();
      await loadApplications();
    } else showLogin();

    client.auth.onAuthStateChange((_event, nextSession) => { session = nextSession; if (!session) showLogin(); });
  }

  loginForm.addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", async () => { await client.auth.signOut(); showLogin(); });
  refreshBtn.addEventListener("click", () => { page = 1; loadApplications(); });
  statusFilter.addEventListener("change", () => { page = 1; loadApplications(); });
  searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page = 1; loadApplications(); }, 450); });
  prevPage.addEventListener("click", () => { if (page > 1) { page -= 1; loadApplications(); } });
  nextPage.addEventListener("click", () => { if (page < pages) { page += 1; loadApplications(); } });
  document.getElementById("closeModal").addEventListener("click", () => detailModal.classList.remove("show"));
  detailModal.addEventListener("click", (event) => { if (event.target === detailModal) detailModal.classList.remove("show"); });
  saveApplication.addEventListener("click", saveCurrent);
  init();
})();
