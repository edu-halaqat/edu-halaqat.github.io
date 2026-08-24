(() => {
  const SUPABASE_URL = "https://fvzoogbdezueswyihxiz.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ";
  const ADMIN_EMAIL = "abdulkareem20112011@gmail.com";

  const message = (text) => {
    if (typeof window.alert === "function") window.alert(text);
  };

  async function sendRecovery() {
    const email = window.prompt("ط£ط¯ط®ظ„ ط¨ط±ظٹط¯ ط­ط³ط§ط¨ ط§ظ„ظ…ط´ط±ظپ", ADMIN_EMAIL);
    if (!email) return;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(`${location.origin}/`)}`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      message(error?.msg || error?.message || "طھط¹ط°ط± ط¥ط±ط³ط§ظ„ ط±ط³ط§ظ„ط© ط§ظ„ط§ط³طھط¹ط§ط¯ط©. ط±ط§ط¬ط¹ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¨ط±ظٹط¯ ظپظٹ Supabase.");
      return;
    }
    message("ط£ظڈط±ط³ظ„طھ ط±ط³ط§ظ„ط© ط§ط³طھط¹ط§ط¯ط© ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±. ط§ظپطھط­ ط§ظ„ط±ط§ط¨ط· ط§ظ„ظ…ظˆط¬ظˆط¯ ظپظٹ ط¨ط±ظٹط¯ظƒ ظ„ط¥ط¯ط®ط§ظ„ ظƒظ„ظ…ط© ط¬ط¯ظٹط¯ط©.");
  }

  function installRecoveryButton() {
    const card = document.querySelector(".login-card");
    if (!card || document.getElementById("sanabil-forgot-password")) return false;
    const button = document.createElement("button");
    button.id = "sanabil-forgot-password";
    button.type = "button";
    button.className = "button button-ghost button-wide";
    button.textContent = "ظ†ط³ظٹطھ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±طں";
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
        <h2>طھط¹ظٹظٹظ† ظƒظ„ظ…ط© ظ…ط±ظˆط± ط¬ط¯ظٹط¯ط©</h2>
        <label>ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط¬ط¯ظٹط¯ط©<input name="password" type="password" minlength="10" required autocomplete="new-password"></label>
        <label>طھط£ظƒظٹط¯ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±<input name="confirm" type="password" minlength="10" required autocomplete="new-password"></label>
        <button class="button button-primary button-wide" type="submit">ط­ظپط¸ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±</button>
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
      if (password.length < 10) return message("ظٹط¬ط¨ ط£ظ† طھظƒظˆظ† ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± 10 ط£ط­ط±ظپ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„.");
      if (password !== confirm) return message("ظƒظ„ظ…طھط§ ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± ظ…طھط·ط§ط¨ظ‚طھظٹظ†.");
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) return message("طھط¹ط°ط± ط­ظپط¸ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±ط› ط£ط¹ط¯ ط¥ط±ط³ط§ظ„ ط±ط§ط¨ط· ط§ظ„ط§ط³طھط¹ط§ط¯ط© ظˆط­ط§ظˆظ„ ظ…ط¬ط¯ط¯ظ‹ط§.");
      history.replaceState({}, "", `${location.origin}/`);
      message("طھظ… طھط¹ظٹظٹظ† ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط¨ظ†ط¬ط§ط­. ظٹظ…ظƒظ†ظƒ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط§ظ„ط¢ظ†.");
      location.reload();
    });
    document.body.appendChild(layer);
  }

  const recovery = new URLSearchParams(location.hash.slice(1));
  if (recovery.get("type") === "recovery" && recovery.get("access_token")) {
    showPasswordForm(recovery.get("access_token"));
  }

  if (!installRecoveryButton()) {
    const observer = new MutationObserver(() => {
      if (installRecoveryButton()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();

