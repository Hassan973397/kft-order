// KFT order page: build a basket, then send it as one formatted WhatsApp message.
(() => {
  const C = window.KFT;
  const $ = id => document.getElementById(id);
  const OTHER = "other";
  const UNKNOWN = "ما أعرف";
  const MAX_LINES = 40;
  const STORE = "kft-order-v2";

  let sel = {p: null, colour: "", size: "", qty: 1};
  let cart = [];

  // ---------- storage (best effort; page works without it) ----------
  const FIELDS = ["name", "phone", "gov", "addr", "weight", "height", "note"];
  function save() {
    try {
      const f = {}; FIELDS.forEach(k => f[k] = $(k).value);
      localStorage.setItem(STORE, JSON.stringify({cart, f}));
    } catch (e) { /* storage blocked */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || "null");
      if (!d) return;
      if (Array.isArray(d.cart)) cart = d.cart.slice(0, MAX_LINES);
      FIELDS.forEach(k => { if (d.f && typeof d.f[k] === "string") $(k).value = d.f[k]; });
    } catch (e) { /* ignore */ }
  }

  // ---------- helpers ----------
  const digits = v => String(v).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const clampQty = v => { const n = parseInt(digits(v), 10); return isNaN(n) ? 0 : Math.min(C.maxPerLine, Math.max(0, n)); };
  const product = id => C.products.find(p => p.id === id);
  function setErr(id, msg) { const e = $("e-" + id); if (e) e.textContent = msg || ""; return !msg; }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function chip(text, pressed, onClick, disabled) {
    const b = el("button", "chip", text); b.type = "button";
    b.setAttribute("aria-pressed", pressed); b.disabled = !!disabled; b.onclick = onClick; return b;
  }

  // ---------- pricing ----------
  function pieces() { return cart.reduce((s, l) => s + l.qty, 0); }
  function pricedTotal() {
    const byProduct = {};
    cart.forEach(l => { if (!l.custom) byProduct[l.pid] = (byProduct[l.pid] || 0) + l.qty; });
    let t = 0;
    for (const id in byProduct) {
      const p = product(id), n = byProduct[id];
      if (!p) continue;
      t += p.pair ? Math.floor(n / 2) * p.pair + (n % 2) * p.price : n * p.price;
    }
    return t;
  }
  const hasCustom = () => cart.some(l => l.custom);
  const needsWH = () => cart.some(l => l.size === UNKNOWN);
  const isWholesale = () => pieces() >= C.wholesaleFrom;

  // ---------- step 1: products ----------
  function renderProducts() {
    const box = $("products"); box.innerHTML = "";
    C.products.forEach(p => {
      const b = el("button", "prod"); b.type = "button";
      b.setAttribute("aria-pressed", sel.p === p.id);
      const left = el("span"); left.append(el("span", "t", p.name), el("br"), el("span", "d", p.desc));
      b.append(left, el("span", "p", p.price + " ألف"));
      b.onclick = () => pick(p.id);
      box.appendChild(b);
    });
    const o = el("button", "prod other"); o.type = "button";
    o.setAttribute("aria-pressed", sel.p === OTHER);
    const l = el("span"); l.append(el("span", "t", "قطعة مو موجودة بالقائمة"), el("br"), el("span", "d", "اكتب شتريد، ونرد عليك بالسعر والتوفر"));
    o.append(l, el("span", "p", "؟"));
    o.onclick = () => pick(OTHER);
    box.appendChild(o);
  }
  function pick(id) {
    sel = {p: id, colour: "", size: "", qty: 1};
    ["colour", "size", "desc", "qty"].forEach(k => setErr(k));
    render();
    $("s-opts").scrollIntoView({behavior: "smooth", block: "start"});
  }

  // ---------- step 2: options ----------
  function renderOpts() {
    $("s-opts").classList.toggle("hidden", !sel.p);
    if (!sel.p) return;
    const custom = sel.p === OTHER, p = product(sel.p);
    $("known").classList.toggle("hidden", custom);
    $("custom").classList.toggle("hidden", !custom);
    $("opts-title").textContent = custom ? "وصف القطعة" : "اللون والقياس";
    $("qty").value = sel.qty;
    if (custom) { $("offer").textContent = ""; $("sizehint").textContent = ""; return; }

    const c = $("colours"); c.innerHTML = "";
    if (p.colours.length) {
      p.colours.forEach(x => c.appendChild(chip(p.soldOut.includes(x) ? x + " (خلص)" : x, sel.colour === x,
        () => { sel.colour = x; renderOpts(); }, p.soldOut.includes(x))));
      c.appendChild(chip("لون ثاني", sel.colour === "لون ثاني", () => { sel.colour = "لون ثاني"; renderOpts(); }));
    } else {
      const i = el("input"); i.placeholder = "اكتب اللون اللي عجبك بالإعلان"; i.value = sel.colour;
      i.oninput = () => { sel.colour = i.value.trim(); };
      c.appendChild(i);
    }
    const s = $("sizes"); s.innerHTML = "";
    p.sizes.concat([UNKNOWN]).forEach(x => s.appendChild(chip(x, sel.size === x, () => { sel.size = x; renderOpts(); })));
    $("sizehint").textContent = "القياسات " + p.sizes[0] + " لحد " + p.sizes[p.sizes.length - 1] + (p.note ? " · " + p.note : "");
    $("offer").textContent = p.pair ? "عرض: القطعتين بـ " + p.pair + " ألف (حتى لو بألوان أو قياسات مختلفة)" : "";
  }

  function readSelection(showErrors) {
    if (!sel.p) return null;
    const qty = clampQty($("qty").value);
    let ok = true;
    const err = (k, m) => { if (showErrors) setErr(k, m); if (m) ok = false; };
    err("qty", qty >= 1 ? "" : "اكتب العدد");
    if (sel.p === OTHER) {
      const desc = $("c-desc").value.trim();
      err("desc", desc.length >= 3 ? "" : "اكتب شنو القطعة");
      if (!ok) return null;
      return {pid: OTHER, custom: true, name: desc, colour: $("c-colour").value.trim(), size: $("c-size").value.trim(), qty};
    }
    const p = product(sel.p);
    err("colour", sel.colour ? "" : "اختار اللون");
    err("size", sel.size ? "" : "اختار القياس، أو «ما أعرف»");
    if (!ok) return null;
    return {pid: p.id, custom: false, name: p.name, colour: sel.colour, size: sel.size, qty};
  }

  function addToCart(line) {
    const same = cart.find(l => !l.custom && !line.custom && l.pid === line.pid && l.colour === line.colour && l.size === line.size);
    if (same) same.qty = Math.min(C.maxPerLine, same.qty + line.qty);
    else if (cart.length < MAX_LINES) cart.push(line);
    else { setErr("cart", "وصلت الحد (" + MAX_LINES + " سطر). للطلبات الأكبر دز القائمة بالواتساب مباشرة."); return false; }
    setErr("cart");
    return true;
  }

  // ---------- step 3: cart ----------
  function renderCart() {
    const box = $("cart"); box.innerHTML = "";
    if (!cart.length) box.appendChild(el("div", "empty", "ما ضفت شي بعد. اختار القطعة واضغط «ضيف للطلب»."));
    cart.forEach((l, i) => {
      const row = el("div", "line");
      const info = el("div");
      const det = l.custom ? [l.colour, l.size].filter(Boolean).join(" · ") || "نأكد وياك التفاصيل"
                           : l.colour + " · " + (l.size === UNKNOWN ? "القياس حسب الوزن والطول" : l.size);
      info.append(el("div", "t", l.custom ? "قطعة خاصة: " + l.name : l.name), el("div", "d", det));
      const ctl = el("div", "ctl");
      const minus = el("button", "", "−"), plus = el("button", "", "+"), rm = el("button", "rm", "✕");
      [minus, plus, rm].forEach(b => b.type = "button");
      minus.setAttribute("aria-label", "نقص"); plus.setAttribute("aria-label", "زيد"); rm.setAttribute("aria-label", "احذف");
      minus.onclick = () => { l.qty = Math.max(1, l.qty - 1); render(); };
      plus.onclick = () => { l.qty = Math.min(C.maxPerLine, l.qty + 1); render(); };
      rm.onclick = () => { cart.splice(i, 1); render(); };
      ctl.append(minus, el("span", "", l.qty), plus, rm);
      row.append(info, ctl);
      box.appendChild(row);
    });

    const n = pieces(), t = pricedTotal();
    const w = $("wholesale");
    w.classList.toggle("hidden", !isWholesale());
    w.textContent = "طلب جملة (" + n + " قطعة): سعر الجملة أقل، ونتفق وياك عليه بالواتساب قبل الشحن. الأسعار هنا بسعر المفرد للتقدير بس.";
    $("totals").innerHTML = "";
    if (cart.length) {
      $("totals").append(
        el("div", "", "عدد القطع: " + n),
        el("div", "", "سعر القطع: " + t + " ألف" + (hasCustom() ? " + سعر القطع الخاصة (نبلغك بيه)" : "")),
        el("div", "", "التوصيل: " + C.delivery + " آلاف"),
      );
      const b = el("b", "", "المجموع " + (isWholesale() || hasCustom() ? "التقريبي" : "") + ": " + (t + C.delivery) + " ألف");
      $("totals").appendChild(b);
    }
    $("wh-box").classList.toggle("hidden", !needsWH());
    $("sum").innerHTML = "";
    $("sum").append(cart.length ? n + " قطعة" : "ما اكو قطع بالطلب",
      el("b", "", cart.length ? (t + C.delivery) + " ألف" + (hasCustom() || isWholesale() ? " تقريباً" : " مع التوصيل") : "—"));
  }

  function render() { renderProducts(); renderOpts(); renderCart(); save(); }

  // ---------- events ----------
  $("minus").onclick = () => { sel.qty = Math.max(1, clampQty($("qty").value) - 1); $("qty").value = sel.qty; };
  $("plus").onclick = () => { sel.qty = Math.min(C.maxPerLine, clampQty($("qty").value) + 1); $("qty").value = sel.qty; };
  $("qty").oninput = () => { sel.qty = clampQty($("qty").value) || 1; };
  $("add").onclick = () => {
    const line = readSelection(true);
    if (!line || !addToCart(line)) return;
    sel = {p: null, colour: "", size: "", qty: 1};
    $("c-desc").value = $("c-colour").value = $("c-size").value = "";
    render();
    $("cart").scrollIntoView({behavior: "smooth", block: "center"});
  };
  C.governorates.forEach(g => { const o = el("option", "", g); o.value = g; $("gov").appendChild(o); });
  FIELDS.forEach(k => $(k).addEventListener("input", save));

  function normPhone(v) {
    v = digits(v).replace(/[^\d+]/g, "");
    if (v.startsWith("+964")) v = "0" + v.slice(4);
    else if (v.startsWith("00964")) v = "0" + v.slice(5);
    else if (v.startsWith("964")) v = "0" + v.slice(3);
    else if (/^7\d{9}$/.test(v)) v = "0" + v;
    return v;
  }
  function makeRef() {
    const d = new Date(), pad = n => String(n).padStart(2, "0");
    return "KFT-" + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + Math.floor(1000 + Math.random() * 9000);
  }

  function buildMessage(ref, phone) {
    const L = ["*طلب جديد " + ref + "*", ""];
    cart.forEach((l, i) => {
      const size = l.size === UNKNOWN ? "القياس حسب الوزن والطول" : l.size;
      const parts = l.custom ? ["قطعة مو بالقائمة: " + l.name, l.colour, size] : [l.name, l.colour, size];
      L.push((i + 1) + ") " + parts.filter(Boolean).join(" — ") + " × " + l.qty);
    });
    const n = pieces(), t = pricedTotal();
    L.push("", "عدد القطع: " + n);
    L.push("المجموع" + (isWholesale() || hasCustom() ? " التقريبي" : "") + ": " + t + " + توصيل " + C.delivery + " = " + (t + C.delivery) + " ألف");
    if (hasCustom()) L.push("بيه قطع خاصة، سعرها يتأكد.");
    if (isWholesale()) L.push("طلب جملة — نتفق على السعر.");
    if (needsWH()) L.push("الوزن: " + (digits($("weight").value).trim() || "—") + " كيلو، الطول: " + (digits($("height").value).trim() || "—") + " سم");
    L.push("", "الاسم: " + $("name").value.trim(), "الهاتف: " + phone, "المحافظة: " + $("gov").value, "العنوان: " + $("addr").value.trim());
    const note = $("note").value.trim(); if (note) L.push("ملاحظة: " + note);
    return L.join("\n");
  }

  let lastText = "";
  $("f").addEventListener("submit", e => {
    e.preventDefault();
    // Customer picked an item but forgot «ضيف للطلب»: add it for them.
    if (sel.p) { const line = readSelection(false); if (line && addToCart(line)) { sel = {p: null, colour: "", size: "", qty: 1}; render(); } }
    const phone = normPhone($("phone").value);
    let ok = true;
    ok &= setErr("cart", cart.length ? "" : "ضيف قطعة وحدة على الأقل للطلب");
    ok &= setErr("name", $("name").value.trim().length >= 2 ? "" : "اكتب الاسم");
    ok &= setErr("phone", /^07\d{9}$/.test(phone) ? "" : "الرقم لازم يكون 11 رقم ويبدي بـ 07");
    ok &= setErr("gov", $("gov").value ? "" : "اختار المحافظة");
    ok &= setErr("addr", $("addr").value.trim().length >= 3 ? "" : "اكتب العنوان");
    if (!ok) {
      const first = [...document.querySelectorAll(".err")].find(x => x.textContent);
      if (first) first.scrollIntoView({behavior: "smooth", block: "center"});
      return;
    }
    const ref = makeRef();
    lastText = buildMessage(ref, phone);
    const url = "https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(lastText);
    // Keep the customer's details for next time, but not the basket that was just sent.
    const sent = cart; cart = []; save(); cart = sent;
    $("ref").textContent = ref;
    $("wa-again").href = url;
    $("f").classList.add("hidden"); $("bar").classList.add("hidden");
    $("done").classList.remove("hidden");
    window.scrollTo(0, 0);
    location.href = url;
  });

  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(lastText); $("copy").textContent = "انتسخ ✓ — الصقه بالواتساب"; }
    catch (e) { window.prompt("انسخ نص الطلب:", lastText); }
  };
  $("new").onclick = () => {
    cart = []; sel = {p: null, colour: "", size: "", qty: 1};
    ["weight", "height", "note"].forEach(k => $(k).value = "");
    $("f").classList.remove("hidden"); $("bar").classList.remove("hidden");
    $("done").classList.add("hidden");
    render(); window.scrollTo(0, 0);
  };

  load();
  render();
})();
