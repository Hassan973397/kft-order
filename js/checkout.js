// One-screen checkout: basket + total + delivery details + one button, then WhatsApp hand-off.
window.Checkout = (() => {
  const {el, money, digits} = KFT;
  const $ = id => document.getElementById(id);
  const cSheet = KFT.sheet($("cSheet"));
  const FORM_KEY = "kft-customer-v3";
  const S = () => Shop.state.settings || {};
  let mode = "closed", sending = false, idem = null, editingDetails = false;

  // ---------- cart bar ----------
  function renderBar() {
    const n = Cart.pieces(), q = Cart.quote;
    $("cartbar").classList.toggle("show", n > 0 && mode !== "checkout");
    const cnt = $("cbCount");
    if (n > (+cnt.textContent || 0)) { cnt.classList.remove("bump"); void cnt.offsetWidth; cnt.classList.add("bump"); }
    cnt.textContent = n;
    $("cbLabel").textContent = n === 1 ? "قطعة وحدة بسلتك" : n + " قطع بسلتك";
    $("cbTotal").textContent = Cart.loading ? "…" : q ? money(q.total) : Cart.error ? "راجع السلة" : "—";
  }

  // ---------- pieces that refresh when the basket changes ----------
  // Small product photo; tapping it opens the photos full screen. No photo → initial letter.
  function lineThumb(l) {
    const p = !l.custom && (Shop.state.products || []).find(x => x.id === l.pid);
    const imgs = p && p.images && p.images.length ? p.images : null;
    const letter = l.custom ? "؟" : l.name.replace(/^(بولو|قميص)\s+/, "").trim().charAt(0);
    if (!imgs) return el("span", {class: "lthumb ph", "aria-hidden": "true"}, letter);
    const im = el("img", {src: imgs[0], alt: "", decoding: "async"});
    const btn = el("button", {class: "lthumb", type: "button", "aria-label": "شوف صورة " + l.name + " بالكبير",
      onclick: () => KFT.lightbox(imgs, 0, l.name)}, im);
    im.addEventListener("load", () => im.classList.add("in"));
    im.addEventListener("error", () => { im.replaceWith(document.createTextNode(letter)); btn.classList.add("ph"); btn.disabled = true; });
    return btn;
  }
  function linesBox() {
    if (!Cart.lines.length) return el("p", {class: "hint"}, "السلة فارغة.");
    return el("div", {}, Cart.lines.map((l, i) => el("div", {class: "line"},
      lineThumb(l),
      el("div", {}, el("div", {class: "t"}, l.custom ? "قطعة خاصة: " + l.name : l.name),
        el("div", {class: "d"}, l.custom ? [l.colour, l.size].filter(Boolean).join(" · ") || "نأكد وياك التفاصيل"
          : l.colour + " · " + (l.size === Shop.UNKNOWN ? "القياس حسب وزنك وطولك" : l.size))),
      el("div", {class: "ctl"},
        el("button", {type: "button", "aria-label": "نقص", onclick: () => l.qty > 1 ? Cart.setQty(i, l.qty - 1) : Cart.remove(i)}, l.qty > 1 ? "−" : "🗑"),
        el("span", {}, l.qty),
        el("button", {type: "button", "aria-label": "زيد", onclick: () => Cart.setQty(i, l.qty + 1)}, "+")))));
  }
  function summary(q) {
    if (!q) return el("div", {class: "sum"}, el("div", {}, Cart.loading ? "نحسب المجموع…" : ""));
    const s = S();
    return el("div", {class: "sum"},
      el("div", {}, el("span", {}, "سعر القطع (" + q.pieces + ")"), el("span", {}, money(q.subtotal))),
      q.discount > 0 ? el("div", {class: "disc"}, el("span", {}, s.discount_label || "الخصم"), el("span", {}, "− " + money(q.discount))) : null,
      el("div", {}, el("span", {}, "التوصيل"), el("span", {}, q.delivery ? money(q.delivery) : "مجاني 🎁")),
      el("div", {class: "total"}, el("span", {}, (q.has_custom || q.is_wholesale) ? "المجموع التقريبي" : "المجموع"), el("span", {}, money(q.total))));
  }
  function notices(q) {
    const s = S(), out = [];
    if (!q) return out;
    if (s.free_delivery_from > 0 && q.delivery > 0 && q.subtotal < s.free_delivery_from)
      out.push(el("div", {class: "notice green"}, "🎁 باقي " + money(s.free_delivery_from - q.subtotal) + " وتصير الشحنة مجانية"));
    if (s.discount_active && s.discount_min > 0 && q.discount === 0 && q.subtotal < s.discount_min)
      out.push(el("div", {class: "notice green"}, "باقي " + money(s.discount_min - q.subtotal) + " وتاخذ " + (s.discount_label || "الخصم")));
    if (q.is_wholesale) out.push(el("div", {class: "notice"}, "📦 طلب جملة (" + q.pieces + " قطعة): سعر الجملة أقل، ونتفق وياك عليه بالواتساب."));
    if (q.has_custom) out.push(el("div", {class: "notice"}, "بالطلب قطع خاصة، سعرها نبلغك بيه على الواتساب."));
    return out;
  }
  function refreshDynamic() {
    if (mode !== "checkout") return;
    const box = $("co-dyn"); if (!box) return;
    box.innerHTML = "";
    box.append(...[linesBox(), Cart.error ? el("p", {class: "err", role: "alert"}, Cart.error) : null, summary(Cart.quote), ...notices(Cart.quote)].filter(Boolean));
    $("co-wh").classList.toggle("hidden", !Cart.lines.some(l => l.size === Shop.UNKNOWN));
    const btn = $("submitBtn"), q = Cart.quote;
    btn.disabled = sending || !q || !S().shop_open || !Cart.lines.length;
    btn.textContent = !S().shop_open ? "الطلبات متوقفة حالياً" : q ? "ثبّت الطلب · " + money(q.total) : Cart.loading ? "نحسب المجموع…" : "ثبّت الطلب";
    if (!Cart.lines.length) { close(); }
  }

  // ---------- delivery details ----------
  const saved = () => KFT.store.get(FORM_KEY, {});
  const complete = d => d.name && /^07\d{9}$/.test(normPhone(d.phone || "")) && d.gov && (d.addr || "").length >= 3;
  const field = (id, label, input) => el("label", {class: "field"}, el("span", {}, label), input, el("p", {class: "err", id: "e-" + id}));
  function detailsBox() {
    const d = saved();
    if (complete(d) && !editingDetails) {
      return el("div", {class: "addr-card"},
        el("div", {}, el("b", {}, "📍 " + d.name), el("div", {class: "d"}, normPhone(d.phone) + " · " + d.gov), el("div", {class: "d"}, d.addr)),
        el("button", {class: "btn btn-ghost", type: "button", onclick: () => { editingDetails = true; open(); }}, "تعديل"),
        ["name", "phone", "gov", "addr"].map(k => el("input", {type: "hidden", id: "f-" + k, value: d[k]})));
    }
    const inp = (id, attrs) => {
      const i = el("input", Object.assign({class: "input", id: "f-" + id, value: d[id] || ""}, attrs));
      i.addEventListener("input", keep); i.addEventListener("blur", () => check(id)); return i;
    };
    const gov = el("select", {class: "input", id: "f-gov"}, el("option", {value: ""}, "اختار المحافظة"), KFT.GOVS.map(g => el("option", {value: g, selected: d.gov === g}, g)));
    gov.addEventListener("change", () => { keep(); check("gov"); });
    return el("div", {},
      el("div", {class: "grid-2"}, field("name", "الاسم", inp("name", {autocomplete: "name", placeholder: "اسمك"})),
        field("phone", "رقم الهاتف", inp("phone", {type: "tel", inputmode: "tel", autocomplete: "tel", placeholder: "07XXXXXXXXX", dir: "ltr", style: "text-align:right"}))),
      el("div", {class: "grid-2"}, field("gov", "المحافظة", gov), field("addr", "العنوان", inp("addr", {autocomplete: "street-address", placeholder: "المنطقة وأقرب نقطة دالة"}))));
  }
  function keep() {
    const v = id => ($("f-" + id) || {}).value || "";
    KFT.store.set(FORM_KEY, Object.assign(saved(), {name: v("name"), phone: v("phone"), gov: v("gov"), addr: v("addr")}));
  }
  const RULES = {
    name: v => v.trim().length >= 2 ? "" : "اكتب الاسم",
    phone: v => /^07\d{9}$/.test(normPhone(v)) ? "" : "الرقم لازم 11 رقم ويبدي بـ 07",
    gov: v => v ? "" : "اختار المحافظة",
    addr: v => v.trim().length >= 3 ? "" : "اكتب العنوان",
  };
  function check(id) {
    const i = $("f-" + id), e = $("e-" + id); if (!i || !e) return true;
    const m = RULES[id](i.value); e.textContent = m; i.setAttribute("aria-invalid", m ? "true" : "false"); return !m;
  }
  function normPhone(v) {
    v = digits(v).replace(/[^\d+]/g, "");
    if (v.startsWith("+964")) v = "0" + v.slice(4); else if (v.startsWith("00964")) v = "0" + v.slice(5);
    else if (v.startsWith("964")) v = "0" + v.slice(3); else if (/^7\d{9}$/.test(v)) v = "0" + v;
    return v;
  }

  function checkoutView() {
    const s = saved();
    const note = el("textarea", {class: "input", id: "f-note", placeholder: "أي شي تريد تضيفه (اختياري)"});
    const noteWrap = el("div", {class: "hidden"}, note);
    return [el("div", {class: "grab"}),
      el("div", {class: "co-head"}, el("h3", {}, "طلبك"), el("button", {class: "btn btn-ghost", type: "button", onclick: close}, "+ ضيف قطع")),
      el("div", {id: "co-dyn"}),
      el("h4", {class: "co-sub"}, "التوصيل لـ"),
      detailsBox(),
      el("div", {id: "co-wh", class: "grid-2 hidden"},
        el("label", {class: "field"}, el("span", {}, "وزنك (كيلو)"), el("input", {class: "input", id: "f-weight", inputmode: "numeric", value: s.weight || ""})),
        el("label", {class: "field"}, el("span", {}, "طولك (سم)"), el("input", {class: "input", id: "f-height", inputmode: "numeric", value: s.height || ""}))),
      el("button", {class: "btn btn-ghost", type: "button", style: "padding:4px 0", onclick: e => { noteWrap.classList.remove("hidden"); e.target.remove(); note.focus(); }}, "+ ضيف ملاحظة"),
      noteWrap,
      el("p", {class: "err", id: "e-submit", role: "alert"}),
      el("div", {class: "co-foot"},
        el("button", {class: "btn btn-wa btn-block btn-lg", type: "button", id: "submitBtn", onclick: submit}, "ثبّت الطلب"),
        el("p", {class: "hint", style: "text-align:center;margin-top:6px"}, "تدفع عند الاستلام · تفحص الطلب گدام المندوب"))];
  }

  function message(r, c) {
    const L = ["*طلب جديد " + r.ref + "*", ""];
    r.items.forEach((it, i) => L.push((i + 1) + ") " + [it.custom ? "قطعة خاصة: " + it.name : it.name, it.colour,
      it.size === Shop.UNKNOWN ? "القياس حسب الوزن والطول" : it.size].filter(Boolean).join(" — ") + " × " + it.qty));
    L.push("", "عدد القطع: " + r.pieces, "سعر القطع: " + money(r.subtotal));
    if (r.discount > 0) L.push("الخصم: − " + money(r.discount));
    L.push("التوصيل: " + (r.delivery ? money(r.delivery) : "مجاني"), "*المجموع" + (r.is_wholesale || r.has_custom ? " التقريبي" : "") + ": " + money(r.total) + "*");
    if (r.is_wholesale) L.push("طلب جملة — نتفق على السعر.");
    if (r.has_custom) L.push("بيه قطع خاصة، سعرها يتأكد.");
    if (c.weight || c.height) L.push("الوزن: " + (c.weight || "—") + " كيلو، الطول: " + (c.height || "—") + " سم");
    L.push("", "الاسم: " + c.name, "الهاتف: " + c.phone, "المحافظة: " + c.governorate, "العنوان: " + c.address);
    if (c.note) L.push("ملاحظة: " + c.note);
    return L.join("\n");
  }

  async function submit() {
    if (sending) return;
    const v = id => ($("f-" + id) || {value: ""}).value.trim();
    const ok = ["name", "phone", "gov", "addr"].map(k => $("f-" + k) && $("f-" + k).type !== "hidden" ? check(k) : !RULES[k](v(k))).every(Boolean);
    if (!ok) { if (!$("e-name")) { editingDetails = true; open(); } const bad = document.querySelector("#cSheet [aria-invalid=true]"); if (bad) bad.focus(); return; }
    const c = {name: v("name"), phone: normPhone(v("phone")), governorate: v("gov"), address: v("addr"),
      weight: digits(v("weight")), height: digits(v("height")), note: v("note")};
    if (Cart.lines.some(l => l.size === Shop.UNKNOWN) && (!c.weight || !c.height)) { $("e-submit").textContent = "اكتب وزنك وطولك حتى نختارلك القياس الصح"; $("f-weight").focus(); return; }
    KFT.store.set(FORM_KEY, Object.assign(saved(), {weight: c.weight, height: c.height}));
    sending = true; const btn = $("submitBtn"); btn.disabled = true; btn.textContent = "نثبّت الطلب…"; $("e-submit").textContent = "";
    idem = idem || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2) + "-kft");
    try {
      const r = await KFT.rpc("kft_place_order", {p_order: Object.assign({idem, items: Cart.payload()}, c)});
      const text = message(r, c), url = "https://wa.me/" + S().whatsapp + "?text=" + encodeURIComponent(text);
      idem = null; mode = "done"; Cart.clear(); renderDone(r, url, text);
      setTimeout(() => { location.href = url; }, 1100);
    } catch (e) {
      $("e-submit").textContent = e.message;
      if (e.network) $("e-submit").append(el("br"), el("a", {class: "btn btn-ghost", href: "https://wa.me/" + (S().whatsapp || "9647801273388")}, "أو راسلنا على الواتساب مباشرة"));
    } finally { sending = false; if (btn.isConnected) refreshDynamic(); }
  }

  function renderDone(r, url, text) {
    const root = $("cSheet"); root.innerHTML = "";
    root.append(el("div", {class: "grab"}),
      el("div", {class: "success"}, el("div", {class: "check"}, "✓"), el("h3", {}, "انحفظ طلبك"),
        el("div", {class: "ref"}, r.ref), el("p", {class: "hint"}, "هسه ينفتح الواتساب — اضغط «إرسال» حتى نثبّت طلبك."),
        summary(r),
        el("div", {class: "actions"},
          el("a", {class: "btn btn-wa btn-lg", href: url}, "افتح الواتساب وأرسل الطلب"),
          el("button", {class: "btn", type: "button", onclick: async e => {
            try { await navigator.clipboard.writeText(text); e.target.textContent = "انتسخ ✓"; } catch (x) { KFT.toast("ما گدرنا ننسخ، استخدم زر الواتساب", true); } }}, "انسخ نص الطلب"),
          el("button", {class: "btn btn-ghost", type: "button", onclick: close}, "رجوع للمحل"))));
  }

  function open() {
    mode = "checkout";
    const root = $("cSheet"); root.innerHTML = "";
    root.append(...checkoutView());
    refreshDynamic(); renderBar();
    if (!root.classList.contains("open")) cSheet.open(() => { mode = "closed"; editingDetails = false; renderBar(); });
  }
  function close() { cSheet.close(); }

  Cart.onChange(() => { renderBar(); refreshDynamic(); });
  $("cbOpen").onclick = open;
  document.addEventListener("kft:ready", renderBar);
  renderBar();
  return {open};
})();
