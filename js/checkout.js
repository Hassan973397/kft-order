// Cart bar, basket sheet, delivery details, order placement and WhatsApp hand-off.
(() => {
  const {el, money, digits} = KFT;
  const $ = id => document.getElementById(id);
  const cSheet = KFT.sheet($("cSheet"));
  const FORM_KEY = "kft-customer-v3";
  const S = () => Shop.state.settings || {};
  let step = "cart", sending = false, idem = null;

  function renderBar() {
    const n = Cart.pieces(), q = Cart.quote;
    $("cartbar").classList.toggle("show", n > 0);
    const cnt = $("cbCount");
    if (n > (+cnt.textContent || 0)) { cnt.classList.remove("bump"); void cnt.offsetWidth; cnt.classList.add("bump"); }
    cnt.textContent = n;
    $("cbLabel").textContent = n === 1 ? "قطعة وحدة بسلتك" : n + " قطع بسلتك";
    $("cbTotal").textContent = Cart.loading ? "…" : q ? money(q.total) + " مع التوصيل" : Cart.error ? "راجع السلة" : "—";
  }

  function summary(q) {
    if (!q) return el("div", {class: "sum"}, el("div", {}, Cart.loading ? "نحسب المجموع…" : ""));
    const s = S();
    const box = el("div", {class: "sum"},
      el("div", {}, el("span", {}, "سعر القطع (" + q.pieces + ")"), el("span", {}, money(q.subtotal))),
      q.discount > 0 ? el("div", {class: "disc"}, el("span", {}, s.discount_label || "الخصم"), el("span", {}, "− " + money(q.discount))) : null,
      el("div", {}, el("span", {}, "التوصيل"), el("span", {}, q.delivery ? money(q.delivery) : "مجاني 🎁")),
      el("div", {class: "total"}, el("span", {}, (q.has_custom || q.is_wholesale) ? "المجموع التقريبي" : "المجموع"), el("span", {}, money(q.total))));
    return box;
  }
  function notices(q) {
    const s = S(), out = [];
    if (!q) return out;
    if (s.free_delivery_from > 0 && q.delivery > 0 && q.subtotal < s.free_delivery_from)
      out.push(el("div", {class: "notice green"}, "🎁 باقي " + money(s.free_delivery_from - q.subtotal) + " وتصير الشحنة مجانية"));
    if (s.discount_active && s.discount_min > 0 && q.discount === 0 && q.subtotal < s.discount_min)
      out.push(el("div", {class: "notice green"}, "باقي " + money(s.discount_min - q.subtotal) + " وتاخذ " + (s.discount_label || "الخصم")));
    if (q.is_wholesale) out.push(el("div", {class: "notice"}, "📦 طلب جملة (" + q.pieces + " قطعة): سعر الجملة أقل، ونتفق وياك عليه بالواتساب قبل الشحن."));
    if (q.has_custom) out.push(el("div", {class: "notice"}, "بالطلب قطع خاصة، سعرها نبلغك بيه على الواتساب."));
    return out;
  }

  function cartView() {
    const lines = Cart.lines.map((l, i) => el("div", {class: "line"},
      el("div", {}, el("div", {class: "t"}, l.custom ? "قطعة خاصة: " + l.name : l.name),
        el("div", {class: "d"}, l.custom ? [l.colour, l.size].filter(Boolean).join(" · ") || "نأكد وياك التفاصيل"
          : l.colour + " · " + (l.size === Shop.UNKNOWN ? "القياس حسب وزنك وطولك" : l.size))),
      el("div", {class: "ctl"},
        el("button", {type: "button", "aria-label": "نقص", onclick: () => Cart.setQty(i, l.qty - 1)}, "−"),
        el("span", {}, l.qty),
        el("button", {type: "button", "aria-label": "زيد", onclick: () => Cart.setQty(i, l.qty + 1)}, "+"),
        el("button", {type: "button", class: "rm", "aria-label": "احذف", onclick: () => Cart.remove(i)}, "✕"))));
    return [el("div", {class: "grab"}), el("div", {class: "steps"}, el("i", {class: "on"}), el("i"), el("i")),
      el("h3", {}, "سلتك"),
      Cart.lines.length ? lines : el("p", {class: "hint"}, "السلة فارغة."),
      Cart.error ? el("p", {class: "err", role: "alert"}, Cart.error) : null,
      summary(Cart.quote), ...notices(Cart.quote), el("div", {style: "height:14px"}),
      el("button", {class: "btn btn-gold btn-block btn-lg", type: "button", disabled: !Cart.quote || !S().shop_open,
        onclick: () => { step = "details"; render(); }}, "التالي: معلومات التوصيل ←"),
      el("button", {class: "btn btn-ghost btn-block", type: "button", onclick: cSheet.close}, "+ ضيف قطع ثانية")];
  }

  const field = (id, label, input) => el("label", {class: "field"}, el("span", {}, label), input, el("p", {class: "err", id: "e-" + id}));
  function detailsView() {
    const saved = KFT.store.get(FORM_KEY, {});
    const inp = (id, attrs) => { const i = el("input", Object.assign({class: "input", id: "f-" + id, value: saved[id] || ""}, attrs)); i.addEventListener("input", keep); return i; };
    const gov = el("select", {class: "input", id: "f-gov"}, el("option", {value: ""}, "اختار المحافظة"), KFT.GOVS.map(g => el("option", {value: g, selected: saved.gov === g}, g)));
    gov.addEventListener("change", keep);
    const needWH = Cart.lines.some(l => l.size === Shop.UNKNOWN);
    return [el("div", {class: "grab"}), el("div", {class: "steps"}, el("i", {class: "on"}), el("i", {class: "on"}), el("i")),
      el("h3", {}, "معلومات التوصيل"), el("p", {class: "hint", style: "margin-bottom:14px"}, "نستخدمها بس حتى نوصل طلبك."),
      field("name", "الاسم", inp("name", {autocomplete: "name", placeholder: "اسمك الكامل"})),
      field("phone", "رقم الهاتف (واتساب)", inp("phone", {type: "tel", inputmode: "tel", autocomplete: "tel", placeholder: "07XXXXXXXXX", dir: "ltr", style: "text-align:right"})),
      field("gov", "المحافظة", gov),
      field("addr", "العنوان وأقرب نقطة دالة", inp("addr", {placeholder: "المنطقة، الشارع، قرب…"})),
      needWH ? el("div", {class: "grid-2"}, field("weight", "الوزن (كيلو)", inp("weight", {inputmode: "numeric"})), field("height", "الطول (سم)", inp("height", {inputmode: "numeric"}))) : null,
      field("note", "ملاحظة (اختياري)", el("textarea", {class: "input", id: "f-note", placeholder: "أي شي تريد تضيفه"})),
      summary(Cart.quote),
      el("p", {class: "err", id: "e-submit", role: "alert"}), el("div", {style: "height:10px"}),
      el("button", {class: "btn btn-wa btn-block btn-lg", type: "button", id: "submitBtn", onclick: submit}, "ثبّت الطلب وأرسله بالواتساب"),
      el("button", {class: "btn btn-ghost btn-block", type: "button", onclick: () => { step = "cart"; render(); }}, "→ رجوع للسلة")];
  }
  function keep() {
    const v = id => ($("f-" + id) || {}).value || "";
    KFT.store.set(FORM_KEY, {name: v("name"), phone: v("phone"), gov: v("gov"), addr: v("addr"), weight: v("weight"), height: v("height")});
  }

  function normPhone(v) {
    v = digits(v).replace(/[^\d+]/g, "");
    if (v.startsWith("+964")) v = "0" + v.slice(4); else if (v.startsWith("00964")) v = "0" + v.slice(5);
    else if (v.startsWith("964")) v = "0" + v.slice(3); else if (/^7\d{9}$/.test(v)) v = "0" + v;
    return v;
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
    const c = {name: v("name"), phone: normPhone(v("phone")), governorate: v("gov"), address: v("addr"),
      weight: digits(v("weight")), height: digits(v("height")), note: v("note")};
    const errs = {name: c.name.length >= 2 ? "" : "اكتب الاسم", phone: /^07\d{9}$/.test(c.phone) ? "" : "الرقم لازم 11 رقم ويبدي بـ 07",
      gov: c.governorate ? "" : "اختار المحافظة", addr: c.address.length >= 3 ? "" : "اكتب العنوان"};
    let first = null;
    for (const [k, m] of Object.entries(errs)) { $("e-" + k).textContent = m; $("f-" + k).setAttribute("aria-invalid", m ? "true" : "false"); if (m && !first) first = $("f-" + k); }
    if (first) { first.focus(); return; }
    sending = true; const btn = $("submitBtn"); btn.disabled = true; btn.textContent = "نثبّت الطلب…"; $("e-submit").textContent = "";
    idem = idem || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2) + "-kft");
    try {
      const r = await KFT.rpc("kft_place_order", {p_order: Object.assign({idem, items: Cart.payload()}, c)});
      const text = message(r, c), url = "https://wa.me/" + S().whatsapp + "?text=" + encodeURIComponent(text);
      Cart.clear(); idem = null; step = "done"; render(r, url, text);
      setTimeout(() => { location.href = url; }, 900);
    } catch (e) {
      $("e-submit").textContent = e.message;
      if (e.network) $("e-submit").append(el("br"), el("a", {class: "btn btn-ghost", href: "https://wa.me/" + (S().whatsapp || "9647801273388")}, "أو راسلنا على الواتساب مباشرة"));
    } finally { sending = false; if (btn.isConnected) { btn.disabled = false; btn.textContent = "ثبّت الطلب وأرسله بالواتساب"; } }
  }

  function doneView(r, url, text) {
    return [el("div", {class: "grab"}), el("div", {class: "steps"}, el("i", {class: "on"}), el("i", {class: "on"}), el("i", {class: "on"})),
      el("div", {class: "success"}, el("div", {class: "check"}, "✓"), el("h3", {}, "انحفظ طلبك"),
        el("div", {class: "ref"}, r.ref), el("p", {class: "hint"}, "هسه ينفتح الواتساب، اضغط «إرسال» حتى يوصلنا الطلب ونثبّته وياك."),
        summary(r),
        el("div", {class: "actions"},
          el("a", {class: "btn btn-wa btn-lg", href: url}, "افتح الواتساب وأرسل الطلب"),
          el("button", {class: "btn", type: "button", onclick: async e => {
            try { await navigator.clipboard.writeText(text); e.target.textContent = "انتسخ ✓"; } catch (x) { KFT.toast("ما گدرنا ننسخ، استخدم زر الواتساب", true); } }}, "انسخ نص الطلب"),
          el("a", {class: "btn", href: "tel:+9647801273388"}, "اتصل بينا"),
          el("button", {class: "btn btn-ghost", type: "button", onclick: () => { step = "cart"; cSheet.close(); }}, "طلب جديد")))];
  }

  function render(...args) {
    renderBar();
    const root = $("cSheet");
    if (step === "done" && !args.length) return;
    root.innerHTML = "";
    root.append(...(step === "cart" ? cartView() : step === "details" ? detailsView() : doneView(...args)).filter(Boolean).flat());
  }

  Cart.onChange(() => { renderBar(); if (step === "cart" && $("cSheet").classList.contains("open")) render(); });
  $("cbOpen").onclick = () => { step = "cart"; render(); cSheet.open(() => { if (step === "done") step = "cart"; }); };
  document.addEventListener("kft:ready", renderBar);
  renderBar();
})();
