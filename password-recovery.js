(() => {
  const SUPABASE_URL = "https://fvzoogbdezueswyihxiz.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ";
  const RESET_URL = "https://edu-halaqat.github.io/reset-password.html";
  const RECOVERY_COOLDOWN_MS = 60_000;

  const message = (text) => {
    if (typeof window.alert === "function") window.alert(text);
  };

  async function sendRecovery() {
    const lastRequest = Number(localStorage.getItem("sanabil-last-recovery-request") || 0);
    const remaining = RECOVERY_COOLDOWN_MS - (Date.now() - lastRequest);
    if (remaining > 0) return message(`انتظر ${Math.ceil(remaining / 1000)} ثانية قبل طلب رسالة أخرى.`);
    const email = window.prompt("أدخل بريدك الإلكتروني المسجل في المنصة", "");
    if (!email) return;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(RESET_URL)}`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 429) return message("تم بلوغ حد إرسال البريد مؤقتًا. انتظر قليلًا ثم أعد المحاولة مرة واحدة.");
      message(error?.msg || error?.message || "تعذر إرسال رسالة الاستعادة. راجع إعدادات البريد في Supabase.");
      return;
    }
    localStorage.setItem("sanabil-last-recovery-request", String(Date.now()));
    message("أُرسلت رسالة استعادة كلمة المرور. افتح الرابط الموجود في بريدك لإدخال كلمة جديدة.");
  }

  function installRecoveryButton() {
    const card = document.querySelector(".login-card");
    if (!card || document.getElementById("sanabil-forgot-password")) return false;
    const button = document.createElement("button");
    button.id = "sanabil-forgot-password";
    button.type = "button";
    button.className = "button button-ghost button-wide";
    button.textContent = "نسيت كلمة المرور؟";
    button.addEventListener("click", () => void sendRecovery());
    const note = card.querySelector(".login-note");
    card.insertBefore(button, note || null);
    return true;
  }

  function showPasswordForm(accessToken) {
    if (document.getElementById("sanabil-password-reset")) return;
    const layer = document.createElement("div");
    layer.id = "sanabil-password-reset";
    layer.dir = "rtl";
    layer.innerHTML = `
      <form>
        <h2>تعيين كلمة مرور جديدة</h2>
        <label>كلمة المرور الجديدة<input name="password" type="password" minlength="10" required autocomplete="new-password"></label>
        <label>تأكيد كلمة المرور<input name="confirm" type="password" minlength="10" required autocomplete="new-password"></label>
        <button class="button button-primary button-wide" type="submit">حفظ كلمة المرور</button>
      </form>`;
    Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "100000", display: "grid", placeItems: "center", padding: "20px", background: "#003d3388", fontFamily: "inherit" });
    const form = layer.querySelector("form");
    Object.assign(form.style, { width: "min(480px, 100%)", padding: "28px", borderRadius: "22px", background: "#fff", color: "#153b33", boxShadow: "0 24px 64px #00281f66" });
    form.querySelectorAll("label").forEach((label) => Object.assign(label.style, { display: "grid", gap: "8px", margin: "16px 0", fontWeight: "700" }));
    form.querySelectorAll("input").forEach((input) => Object.assign(input.style, { minHeight: "48px", padding: "10px 14px", border: "1px solid #d5c7ad", borderRadius: "12px", font: "inherit" }));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const password = String(data.get("password") || "");
      const confirm = String(data.get("confirm") || "");
      if (password.length < 10) return message("يجب أن تكون كلمة المرور 10 أحرف على الأقل.");
      if (password !== confirm) return message("كلمتا المرور غير متطابقتين.");
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) return message("تعذر حفظ كلمة المرور؛ أعد إرسال رابط الاستعادة وحاول مجددًا.");
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
      }).catch(() => undefined);
      history.replaceState({}, "", `${location.origin}/reset-password.html?success=1`);
      message("تم تعيين كلمة المرور بنجاح. سجّل الدخول الآن بكلمة المرور الجديدة.");
      location.replace(`${location.origin}/`);
    });
    document.body.appendChild(layer);
  }

  const recovery = new URLSearchParams(location.hash.slice(1));
  if (recovery.get("type") === "recovery" && recovery.get("access_token")) {
    if (!location.pathname.endsWith("/reset-password.html")) {
      location.replace(`${RESET_URL}${location.hash}`);
    } else {
      showPasswordForm(recovery.get("access_token"));
    }
  } else if (location.pathname.endsWith("/reset-password.html")) {
    const errorDescription = recovery.get("error_description");
    if (errorDescription) message("رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.");
  }

  if (!installRecoveryButton()) {
    const observer = new MutationObserver(() => {
      if (installRecoveryButton()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();

