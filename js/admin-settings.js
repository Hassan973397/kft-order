// Settings tab: ordering on/off, delivery, discount, wholesale, announcement, WhatsApp, password.
(() => {
  const {el, money, toInt, digits} = KFT;
  const root = document.getElementById("tab-settings");
  let draft = null, bar = null;

  const dirty = () => JSON.stringify(draft) !== JSON.stringify(Admin.state.data.settings);
  function touch() { if (bar) bar.classList.toggle("hidden", !dirty()); }

  function sw(key, label, hint) {
    const i = el("input", {type: "checkbox", checked: draft[key], onchange: e => { draft[key] = e.target.checked; paint(); }});
    return el("div", {class: "setrow"}, el("div", {}, el("b", {}, label), hint ? el("div", {class: "hint"}, hint) : null),
      el("label", {class: "switch"}, i, el("span", {class: "track"})));
  }
  function num(key, label, {suffix = "money", hint = ""} = {}) {
    const i = el("input", {class: "input", inputmode: "numeric", value: draft[key]});
    const pv = el("div", {class: "preview"});
    const upd = () => { const n = toInt(i.value); draft[key] = n == null ? 0 : n;
      pv.textContent = suffix === "money" ? (draft[key] ? "= " + money(draft[key]) : hint) : suffix === "pct" ? draft[key] + "%" : hint; touch(); };
    i.addEventListener("input", upd); upd();
    return el("label", {class: "field"}, el("span", {}, label), i, pv);
  }
  function text(key, label, ph, max) {
    const i = el(max > 100 ? "textarea" : "input", {class: "input", placeholder: ph, maxlength: max});
    i.value = draft[key] || "";
    i.addEventListener("input", () => { draft[key] = i.value; touch(); });
    return el("label", {class: "field"}, el("span", {}, label), i);
  }

  function paint() {
    if (!draft) draft = JSON.parse(JSON.stringify(Admin.state.data.settings));
    root.innerHTML = "";
    const phone = el("input", {class: "input", inputmode: "tel", dir: "ltr", value: "0" + draft.whatsapp.slice(3)});
    phone.addEventListener("input", () => { let v = digits(phone.value).replace(/\D/g, ""); if (v.startsWith("07")) v = "964" + v.slice(1); draft.whatsapp = v; touch(); });
    const seg = el("div", {class: "seg"}, [["percent", "نسبة %"], ["amount", "مبلغ ثابت"]].map(([v, l]) =>
      el("button", {type: "button", "aria-pressed": String(draft.discount_type === v), onclick: () => { draft.discount_type = v; paint(); }}, l)));

    root.append(el("div", {class: "settings"},
      el("div", {class: "card"}, el("h3", {}, "🛒 استقبال الطلبات"),
        sw("shop_open", "الطلبات شغّالة", draft.shop_open ? "الزبائن يگدرون يطلبون" : "الصفحة تعرض القطع بس ما تقبل طلبات"),
        draft.shop_open ? null : text("closed_message", "الرسالة اللي تطلع للزبون", "مثلاً: عطلة العيد، نرجع يوم السبت", 200),
        text("announcement", "شريط إعلان فوگ الصفحة (اختياري)", "مثلاً: وصلت تشكيلة الشتاء 🔥", 160)),
      el("div", {class: "card"}, el("h3", {}, "🚚 التوصيل"),
        num("delivery_fee", "سعر التوصيل لكل طلب (دينار)", {hint: "0 = توصيل مجاني دائماً"}),
        num("free_delivery_from", "توصيل مجاني إذا الطلب من (دينار)", {hint: "0 = ماكو توصيل مجاني"})),
      el("div", {class: "card"}, el("h3", {}, "🏷️ الخصم"),
        sw("discount_active", "الخصم شغّال", "يطلع شريط أخضر للزبائن وينحسب تلقائياً"),
        el("div", {class: "field"}, el("span", {}, "نوع الخصم"), seg),
        num("discount_value", draft.discount_type === "percent" ? "نسبة الخصم (لحد 90%)" : "مبلغ الخصم (دينار)", {suffix: draft.discount_type === "percent" ? "pct" : "money"}),
        num("discount_min", "الخصم يبدي من طلب بقيمة (دينار)", {hint: "0 = على كل الطلبات"}),
        text("discount_label", "اسم العرض (اختياري)", "مثلاً: خصم الجمعة البيضاء", 60)),
      el("div", {class: "card"}, el("h3", {}, "📦 الجملة والتواصل"),
        num("wholesale_from", "الطلب يعتبر جملة من كم قطعة", {suffix: "n", hint: "يطلع للزبون إن سعر الجملة نتفق عليه"}),
        el("label", {class: "field"}, el("span", {}, "رقم الواتساب اللي توصله الطلبات"), phone)),
      passwordCard()));
    bar = el("div", {class: "savebar hidden"}, el("span", {}, "عندك تغييرات ما انحفظت"),
      el("button", {class: "btn btn-ghost", type: "button", onclick: () => { draft = null; paint(); }}, "تراجع"),
      el("button", {class: "btn btn-gold", type: "button", onclick: saveAll}, "حفظ"));
    root.append(bar); touch();
  }

  async function saveAll(e) {
    const b = e.target; b.disabled = true; b.textContent = "نحفظ…";
    try {
      Admin.state.data.settings = await Admin.call("kft_admin_save_settings", {s: draft});
      draft = null; paint(); KFT.toast("انحفظت الإعدادات ✓ وطلعت للزبائن");
    } catch (err) { KFT.toast(err.message, true); b.disabled = false; b.textContent = "حفظ"; }
  }

  function passwordCard() {
    const o = el("input", {class: "input", type: "password", autocomplete: "current-password", dir: "ltr"});
    const n = el("input", {class: "input", type: "password", autocomplete: "new-password", dir: "ltr"});
    const msg = el("p", {class: "err", role: "alert"});
    return el("div", {class: "card"}, el("h3", {}, "🔒 كلمة السر"),
      el("label", {class: "field"}, el("span", {}, "كلمة السر الحالية"), o),
      el("label", {class: "field"}, el("span", {}, "كلمة السر الجديدة (8 أحرف أو أكثر)"), n), msg,
      el("button", {class: "btn btn-block", type: "button", onclick: async () => {
        msg.textContent = "";
        try {
          const r = await Admin.call("kft_admin_change_password", {p_old: o.value, p_new: n.value});
          if (r && r.error) { msg.textContent = r.error; return; }
          o.value = n.value = ""; KFT.toast("تغيّرت كلمة السر ✓");
        }
        catch (e) { msg.textContent = e.message; } }}, "تغيير كلمة السر"));
  }

  Admin.tabs.settings = {render: () => { draft = null; paint(); }, refresh: paint};
})();
