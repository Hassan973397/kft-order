// Products tab: quick stock toggles, show/hide, reorder, full editor sheet.
(() => {
  const {el, money, toInt} = KFT;
  const root = document.getElementById("tab-products");
  const eSheet = KFT.sheet(document.getElementById("eSheet"));
  const PRESETS = {"L → 3XL": ["L", "XL", "2XL", "3XL"], "L → 7XL": ["L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"], "M → 2XL": ["M", "L", "XL", "2XL"]};
  const products = () => Admin.state.data.products;

  async function save(p, msg) {
    const saved = await Admin.call("kft_admin_save_product", {p});
    const list = products(), i = list.findIndex(x => x.id === saved.id);
    if (i >= 0) list[i] = saved; else list.push(saved);
    if (msg) KFT.toast(msg);
    return saved;
  }

  // Optimistic quick edits (stock dots, show/hide) with rollback on failure.
  async function quick(p, mutate, msg) {
    const before = JSON.parse(JSON.stringify(p));
    mutate(p); paint();
    try { await save(p, msg); } catch (e) { Object.assign(p, before); paint(); KFT.toast(e.message, true); }
  }

  async function move(i, d) {
    const list = products(), j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; paint();
    try { await Admin.call("kft_admin_reorder", {p_ids: list.map(p => p.id)}); }
    catch (e) { [list[i], list[j]] = [list[j], list[i]]; paint(); KFT.toast(e.message, true); }
  }

  function row(p, i) {
    const sw = el("label", {class: "switch", title: p.active ? "ظاهر للزبائن" : "مخفي"},
      el("input", {type: "checkbox", checked: p.active, onchange: e => quick(p, x => { x.active = e.target.checked; }, e.target.checked ? "صار ظاهر للزبائن" : "انخفى من الصفحة")}),
      el("span", {class: "track"}), el("small", {}, p.active ? "ظاهر" : "مخفي"));
    const opt = (kind, o) => el("button", {class: "stock", type: "button", "aria-pressed": String(o.ok), title: o.ok ? "اضغط إذا خلص" : "اضغط إذا رجع",
      onclick: () => quick(p, x => { const t = x[kind].find(y => y.n === o.n); t.ok = !t.ok; }, o.ok ? o.n + ": خلص" : o.n + ": رجع متوفر")}, o.n);
    return el("article", {class: "prow" + (p.active ? "" : " off")},
      el("div", {class: "h"}, el("div", {class: "nm"}, el("b", {}, p.name),
        el("small", {}, money(p.price), p.old_price ? " (كان " + money(p.old_price) + ")" : "", p.pair_price ? " · القطعتين " + money(p.pair_price) : "")), sw),
      el("div", {class: "opts"},
        p.colours.length ? [el("small", {}, "الألوان — اضغط على اللون إذا خلص أو رجع"), el("div", {class: "chips"}, p.colours.map(o => opt("colours", o)))] : el("small", {}, "الزبون يكتب اللون بنفسه"),
        el("small", {}, "القياسات"), el("div", {class: "chips"}, p.sizes.map(o => opt("sizes", o)))),
      el("div", {class: "tools"},
        el("button", {class: "btn", type: "button", onclick: () => edit(p)}, "✎ تعديل"),
        el("button", {class: "icon-btn", type: "button", "aria-label": "لفوگ", disabled: i === 0, onclick: () => move(i, -1)}, "↑"),
        el("button", {class: "icon-btn", type: "button", "aria-label": "لجوه", disabled: i === products().length - 1, onclick: () => move(i, 1)}, "↓")));
  }

  function paint() {
    root.innerHTML = "";
    root.append(el("div", {class: "toolbar"}, el("p", {class: "hint", style: "flex:1;margin:0"}, "التغييرات تطلع للزبائن فوراً."),
        el("button", {class: "btn btn-gold", type: "button", onclick: () => edit(null)}, "+ منتج جديد")),
      el("div", {class: "plist"}, products().map(row)));
    if (!products().length) root.append(el("div", {class: "empty"}, "ما اكو منتجات. ضيف أول منتج."));
  }

  function optEditor(title, items, placeholder, presets) {
    const box = el("div", {class: "optlist"}), input = el("input", {class: "input", placeholder});
    const draw = () => { box.innerHTML = ""; items.forEach((o, i) => box.append(el("span", {class: "opt" + (o.ok ? "" : " off")}, o.n,
      el("button", {type: "button", title: o.ok ? "خلص" : "متوفر", onclick: () => { o.ok = !o.ok; draw(); }}, o.ok ? "✓" : "↺"),
      el("button", {type: "button", title: "شيل", onclick: () => { items.splice(i, 1); draw(); }}, "✕")))); };
    const add = () => { input.value.split(/[،,]/).map(s => s.trim()).filter(Boolean).forEach(n => { if (!items.some(o => o.n === n)) items.push({n, ok: true}); }); input.value = ""; draw(); };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    draw();
    return el("div", {class: "field"}, el("span", {}, title), box,
      el("div", {class: "addrow"}, input, el("button", {class: "btn", type: "button", onclick: add}, "ضيف")),
      presets ? el("div", {class: "presets"}, Object.entries(presets).map(([k, v]) => el("button", {class: "chip", type: "button",
        onclick: () => { v.forEach(n => { if (!items.some(o => o.n === n)) items.push({n, ok: true}); }); draw(); }}, "+ " + k))) : null);
  }

  function moneyField(label, value, hint) {
    const i = el("input", {class: "input", inputmode: "numeric", placeholder: "مثلاً 20000", value: value || ""});
    const pv = el("div", {class: "preview"});
    const upd = () => { const n = toInt(i.value); pv.textContent = n ? "= " + money(n) : hint || ""; };
    i.addEventListener("input", upd); upd();
    return {node: el("label", {class: "field"}, el("span", {}, label), i, pv), get: () => toInt(i.value)};
  }

  function edit(p) {
    const d = p ? JSON.parse(JSON.stringify(p)) : {name: "", description: "", price: "", old_price: null, pair_price: null, sizes: [], colours: [], free_colour: false, note: "", active: true};
    const root2 = document.getElementById("eSheet"); root2.innerHTML = "";
    const name = el("input", {class: "input", value: d.name, maxlength: 80, placeholder: "مثلاً: بولو قطن شتوي"});
    const desc = el("input", {class: "input", value: d.description, maxlength: 160, placeholder: "سطر قصير: الخامة أو الميزة"});
    const note = el("input", {class: "input", value: d.note, maxlength: 120, placeholder: "مثلاً: من وزن 70 لحد 150 كيلو"});
    const price = moneyField("السعر (دينار)", d.price), old = moneyField("السعر قبل التخفيض (اختياري)", d.old_price, "يطلع مشطوب جنب السعر"),
          pair = moneyField("سعر القطعتين (اختياري)", d.pair_price, "عرض: القطعتين بسعر أقل");
    const free = el("input", {type: "checkbox", checked: d.free_colour});
    const active = el("input", {type: "checkbox", checked: d.active});
    const err = el("p", {class: "err", role: "alert"});
    const btn = el("button", {class: "btn btn-gold btn-block btn-lg", type: "button"}, p ? "حفظ التعديلات" : "إضافة المنتج");
    btn.onclick = async () => {
      err.textContent = "";
      const body = Object.assign({}, d, {name: name.value.trim(), description: desc.value.trim(), note: note.value.trim(),
        price: price.get(), old_price: old.get() || null, pair_price: pair.get() || null, free_colour: free.checked, active: active.checked});
      if (body.name.length < 2) return (err.textContent = "اكتب اسم المنتج");
      if (!body.price) return (err.textContent = "اكتب السعر");
      if (body.old_price && body.old_price <= body.price) return (err.textContent = "السعر قبل التخفيض لازم يكون أكبر من السعر الحالي");
      if (!body.sizes.length) return (err.textContent = "ضيف قياس واحد على الأقل");
      btn.disabled = true; btn.textContent = "نحفظ…";
      try { await save(body, p ? "انحفظ ✓" : "انضاف المنتج ✓"); eSheet.close(); paint(); }
      catch (e) { err.textContent = e.message; }
      finally { btn.disabled = false; btn.textContent = p ? "حفظ التعديلات" : "إضافة المنتج"; }
    };
    const del = p ? el("button", {class: "btn btn-danger btn-block", type: "button", style: "margin-top:10px", onclick: () => {
      if (root2.querySelector(".confirm")) return;
      root2.append(el("div", {class: "confirm"}, el("p", {style: "margin:0 0 10px"}, "متأكد تريد تحذف «" + p.name + "»؟ راح ينشال من صفحة الزبائن. الطلبات القديمة تبقى."),
        el("div", {class: "grid-2"}, el("button", {class: "btn btn-danger", type: "button", onclick: async () => {
          try { await Admin.call("kft_admin_delete_product", {p_id: p.id}); Admin.state.data.products = products().filter(x => x.id !== p.id); KFT.toast("انحذف"); eSheet.close(); paint(); }
          catch (e) { err.textContent = e.message; } }}, "إي، احذفه"),
          el("button", {class: "btn", type: "button", onclick: e => e.target.closest(".confirm").remove()}, "لا"))));
      root2.lastChild.scrollIntoView({behavior: "smooth"}); }}, "حذف المنتج") : null;
    root2.append(el("div", {class: "grab"}), el("h3", {}, p ? "تعديل: " + p.name : "منتج جديد"), el("div", {style: "height:10px"}),
      el("label", {class: "field"}, el("span", {}, "اسم المنتج"), name),
      el("label", {class: "field"}, el("span", {}, "وصف قصير"), desc),
      price.node, el("div", {class: "grid-2"}, old.node, pair.node),
      optEditor("الألوان", d.colours, "اكتب اللون واضغط ضيف (تگدر تكتب أكثر من لون بينهم فارزة)"),
      el("div", {class: "setrow"}, el("span", {}, "الزبون يكتب اللون بنفسه"), el("label", {class: "switch"}, free, el("span", {class: "track"}))),
      optEditor("القياسات", d.sizes, "مثلاً XL", PRESETS),
      el("label", {class: "field"}, el("span", {}, "ملاحظة القياس (اختياري)"), note),
      el("div", {class: "setrow"}, el("span", {}, "ظاهر للزبائن"), el("label", {class: "switch"}, active, el("span", {class: "track"}))),
      err, btn, ...(del ? [del] : []));
    eSheet.open();
  }

  Admin.tabs.products = {render: paint, refresh: paint};
})();
