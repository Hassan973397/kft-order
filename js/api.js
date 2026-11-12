// Shared helpers: backend calls, money formatting, colour swatches, toasts.
window.KFT = (() => {
  // Public (publishable) key: safe in the browser. All data access goes through kft_* RPCs.
  const URL = "https://cdqqcnohtcfhgotyjgnz.supabase.co/rest/v1/rpc/";
  const KEY = "sb_publishable_3t2Fz1P_V5PCmWNNFPIjKA_G8o4hnmt";

  async function rpc(name, body = {}, {timeout = 15000} = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    let res;
    try {
      res = await fetch(URL + name, {method: "POST", signal: ctl.signal,
        headers: {apikey: KEY, "Content-Type": "application/json"}, body: JSON.stringify(body)});
    } catch (e) {
      throw Object.assign(new Error("ما اكو اتصال بالإنترنت، أو السيرفر ما يرد. جرّب مرة ثانية."), {network: true});
    } finally { clearTimeout(t); }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw Object.assign(new Error((data && data.message) || "صار خطأ، جرّب مرة ثانية"), {code: data && data.code});
    return data;
  }

  // Anon JWT (public) — only needed for the photo-upload function, which verifies JWTs.
  const ANON_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkcXFjbm9odGNmaGdvdHlqZ256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzcyMjIsImV4cCI6MjA5NDkxMzIyMn0.CUFfwDvH4N3Zmzy2U9uPYRuycku_rCiywdXQoMf9Rd4";
  const FN = "https://cdqqcnohtcfhgotyjgnz.supabase.co/functions/v1/";

  const nf = new Intl.NumberFormat("en-US");
  const money = iqd => nf.format(Math.round(Number(iqd) || 0)) + " د.ع";
  const commas = v => { const n = toInt(v); return n == null ? "" : nf.format(n); };

  // Money input that writes the thousands comma while typing: 20000 -> 20,000
  function moneyInput(value, attrs = {}) {
    const i = el("input", Object.assign({class: "input money", inputmode: "numeric", dir: "ltr", autocomplete: "off"}, attrs));
    i.value = value ? commas(value) : "";
    i.addEventListener("input", () => {
      const fromEnd = i.value.length - (i.selectionStart ?? i.value.length);
      i.value = commas(i.value);
      const pos = Math.max(0, i.value.length - fromEnd);
      try { i.setSelectionRange(pos, pos); } catch (e) { /* some input types don't support it */ }
    });
    return i;
  }

  // Shrink photos in the browser before upload: max 1400px, WebP ~80%. Keeps uploads fast on mobile data.
  async function shrinkImage(file, max = 1400) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error("هذا الملف مو صورة، أو نوعه غير مدعوم");
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/webp", 0.8));
    if (blob && blob.type === "image/webp") return blob;
    return await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
  }
  async function uploadImage(token, blob) {
    let res;
    try {
      res = await fetch(FN + "kft-upload", {method: "POST", body: blob,
        headers: {"Content-Type": blob.type, "x-kft-token": token, Authorization: "Bearer " + ANON_JWT, apikey: ANON_JWT}});
    } catch (e) { throw new Error("انقطع الاتصال وقت رفع الصورة"); }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(d.error || "ما گدرنا نرفع الصورة"), {code: res.status === 401 ? "28000" : null});
    return d.url;
  }
  const toInt = v => { const n = parseInt(String(v ?? "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; };
  const digits = v => String(v ?? "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

  const COLOURS = {
    "أسود":"#151515","اسود":"#151515","أبيض":"#f4f4f0","أوف وايت":"#efe9da","بيج":"#cdb894","بيجي":"#cdb894","خاكي":"#b7a27a",
    "رصاصي":"#8d949b","رصاصي فاتح":"#b9bec4","رصاصي غامق":"#5b6168","رصاصي طوخ":"#6b7a90","نيلي":"#28356b","نيلي طوخ":"#2a3560",
    "كحلي":"#1c2440","أسود كحلي":"#161c2e","بحري":"#3f6fae","أزرق":"#2f62c8","سمائي":"#8cc3e8","فيروزي":"#3fb4b0","زيتوني":"#6b7340",
    "قهوائي":"#6b4a33","جوزي":"#7a5236","خردلي":"#c9a227","أحمر":"#b52a2a","أخضر":"#2f7a4a","وردي":"#e7a3b7","بنفسجي":"#6c4aa0"
  };
  const swatch = name => COLOURS[(name || "").trim()] || null;

  let toastEl, toastT;
  function toast(msg, bad = false) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.toggle("bad", bad); toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "text") e.textContent = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return e;
  }

  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } },
  };

  function sheet(root) {
    const bd = el("div", {class: "sheet-backdrop hidden"});
    document.body.append(bd);
    let onClose = null;
    function close() { root.classList.remove("open"); bd.classList.remove("open"); setTimeout(() => { bd.classList.add("hidden"); root.classList.add("hidden"); }, 250); document.body.style.overflow = ""; onClose && onClose(); }
    function open(cb) { onClose = cb || null; bd.classList.remove("hidden"); root.classList.remove("hidden"); requestAnimationFrame(() => { bd.classList.add("open"); root.classList.add("open"); }); document.body.style.overflow = "hidden"; }
    bd.addEventListener("click", close);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && root.classList.contains("open")) close(); });
    return {open, close};
  }

  const GOVS = ["النجف","بغداد","كربلاء","بابل","البصرة","ذي قار","الديوانية","واسط","ميسان","المثنى","ديالى","صلاح الدين","كركوك","الأنبار","نينوى","أربيل","السليمانية","دهوك","حلبجة"];
  // Hover/focus explanations: any element with data-tip gets a styled bubble (see .tip in base.css).
  (function tips() {
    let bubble, cur;
    const show = t => {
      const text = t.getAttribute("data-tip"); if (!text) return;
      if (!bubble) { bubble = el("div", {class: "tip", role: "tooltip"}); document.body.append(bubble); }
      bubble.textContent = text; bubble.classList.add("show"); cur = t;
      const r = t.getBoundingClientRect(), b = bubble.getBoundingClientRect();
      let top = r.top - b.height - 8; if (top < 6) top = r.bottom + 8;
      const left = Math.min(innerWidth - b.width - 8, Math.max(8, r.left + r.width / 2 - b.width / 2));
      bubble.style.top = top + "px"; bubble.style.left = left + "px";
    };
    const hide = () => { if (bubble) bubble.classList.remove("show"); cur = null; };
    document.addEventListener("pointerover", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t && t !== cur && e.pointerType === "mouse") show(t); else if (!t) hide(); });
    document.addEventListener("focusin", e => { const t = e.target.closest && e.target.closest("[data-tip]"); t ? show(t) : hide(); });
    document.addEventListener("scroll", hide, true);
    document.addEventListener("pointerdown", hide);
  })();

  return {rpc, money, commas, moneyInput, toInt, digits, swatch, toast, el, store, sheet, GOVS, shrinkImage, uploadImage};
})();
