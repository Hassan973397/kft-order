// Owner panel shell: login, session, tabs, stats, shared data.
window.Admin = (() => {
  const {el, money} = KFT;
  const $ = id => document.getElementById(id);
  const SESSION = "kft-admin-session";
  const state = {token: null, data: null, tab: "orders"};
  const tabs = {};   // name -> {render, refresh}

  function session() {
    const s = KFT.store.get(SESSION);
    if (s && s.token && new Date(s.expires_at) > new Date()) return s;
    KFT.store.del(SESSION); return null;
  }

  // Every admin call goes through here so an expired session sends the owner back to login.
  async function call(name, body = {}) {
    try { return await KFT.rpc(name, Object.assign({p_token: state.token}, body)); }
    catch (e) { if (e.code === "28000") { logout(true); } throw e; }
  }

  async function loadData() {
    state.data = await call("kft_admin_data");
    $("who").textContent = "أهلاً " + state.data.username;
    renderStats();
    return state.data;
  }

  function renderStats() {
    const s = state.data.stats, box = $("stats"); box.innerHTML = "";
    const stat = (label, value, hot) => el("div", {class: "stat" + (hot ? " hot" : "")}, el("small", {}, label), el("b", {}, value));
    box.append(stat("طلبات جديدة", s.new, s.new > 0), stat("طلبات اليوم", s.today), stat("مبيعات اليوم", money(s.today_total)), stat("قطع اليوم", s.today_pieces));
    const b = $("newBadge"); b.textContent = s.new; b.classList.toggle("hidden", !s.new);
  }

  function showTab(name) {
    state.tab = name;
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    ["orders", "products", "settings"].forEach(t => $("tab-" + t).classList.toggle("hidden", t !== name));
    tabs[name] && tabs[name].render();
    KFT.store.set("kft-admin-tab", name);
  }

  async function start() {
    $("login").classList.add("hidden"); $("app").classList.remove("hidden");
    try { await loadData(); } catch (e) { if (e.code !== "28000") KFT.toast(e.message, true); return; }
    showTab(KFT.store.get("kft-admin-tab", "orders"));
  }

  function logout(expired) {
    if (state.token && !expired) KFT.rpc("kft_admin_logout", {p_token: state.token}).catch(() => {});
    state.token = null; KFT.store.del(SESSION);
    $("app").classList.add("hidden"); $("login").classList.remove("hidden");
    $("lerr").textContent = expired ? "انتهت الجلسة، سجّل دخول من جديد" : "";
    $("lp").value = ""; $("lu").focus();
  }

  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const u = $("lu").value.trim(), p = $("lp").value, btn = $("lbtn");
    if (!u || !p) { $("lerr").textContent = "اكتب اسم المستخدم وكلمة السر"; return; }
    btn.disabled = true; btn.textContent = "لحظة…"; $("lerr").textContent = "";
    try {
      const s = await KFT.rpc("kft_admin_login", {p_username: u, p_password: p});
      if (s.error) { $("lerr").textContent = s.error; return; }
      state.token = s.token; KFT.store.set(SESSION, s); $("lp").value = "";
      await start();
    } catch (err) { $("lerr").textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = "دخول"; }
  });
  $("logout").onclick = () => logout(false);
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));

  // Light polling so new orders show up without reloading.
  setInterval(async () => {
    if (!state.token || document.hidden) return;
    const before = state.data ? state.data.stats.new : 0;
    try {
      await loadData();
      if (state.data.stats.new > before) { KFT.toast("🔔 وصل طلب جديد"); if (state.tab === "orders") tabs.orders.refresh(); }
    } catch (e) { /* offline: try next tick */ }
  }, 45000);

  addEventListener("DOMContentLoaded", () => {
    const s = session();
    if (s) { state.token = s.token; start(); } else { $("login").classList.remove("hidden"); $("lu").focus(); }
  });

  return {state, call, loadData, renderStats, tabs, money};
})();
