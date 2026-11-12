// Products tab: search, quick stock toggles, show/hide, reorder, duplicate, full editor with photos.
(() => {
  const {el, money, toInt, moneyInput} = KFT;
  const root = document.getElementById("tab-products");
  const eSheet = KFT.sheet(document.getElementById("eSheet"));
  const PRESETS = {"L → 3XL": ["L", "XL", "2XL", "3XL"], "L → 7XL": ["L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"], "M → 2XL": ["M", "L", "XL", "2XL"]};
  const products = () => Admin.state.data.products;
  let query = "";

  async function save(p, msg) {
    const saved = await Admin.call("kft_admin_save_product", {p});
    let final = saved;
    if (Array.isArray(p.images) && JSON.stringify(p.images) !== JSON.stringify(saved.images || []))
      final = await Admin.call("kft_admin_set_images", {p_id: saved.id, p_images: p.images});
    const list = products(), i = list.findIndex(x => x.id === final.id);
    if (i >= 0) list[i] = final; else list.push(final);
    if (msg) KFT.toast(msg);
    return final;
  }

  // Optimistic quick edits (stock, show/hide) with rollback on failure.
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
    const sw = el("label", {class: "switch", "data-tip": p.active ? "القطعة ظاهرة للزبائن. اضغط حتى تخفيها بدون ما تنحذف" : "القطعة مخفية عن الزبائن. اضغط حتى ترجع تطلع"},
      el("input", {type: "checkbox", checked: p.active, onchange: e => quick(p, x => { x.active = e.target.checked; }, e.target.checked ? "صارت ظاهرة للزبائن" : "انخفت من الصفحة")}),
      el("span", {class: "track"}), el("small", {}, p.active ? "ظاهر" : "مخفي"));
    const opt = (kind, o) => el("button", {class: "stock", type: "button", "aria-pressed": String(o.ok),
      "data-tip": o.ok ? "«" + o.n + "» متوفر. اضغط إذا خلص حتى ينقفل عند الزبون" : "«" + o.n + "» خالص. اضغط إذا رجع متوفر",
      onclick: () => quick(p, x => { const t = x[kind].find(y => y.n === o.n); t.ok = !t.ok; }, o.ok ? o.n + ": خلص" : o.n + ": رجع متوفر")}, o.n);
    const thumb = p.images && p.images[0] ? el("img", {class: "pthumb", src: p.images[0], alt: "", loading: "lazy"}) : el("span", {class: "pthumb ph", "aria-hidden": "true"}, "📷");
    return el("article", {class: "prow" + (p.active ? "" : " off")},
      el("div", {class: "h"}, thumb, el("div", {class: "nm"}, el("b", {}, p.name),
        el("small", {}, money(p.price), p.old_price ? " · كان " + money(p.old_price) : "", p.pair_price ? " · القطعتين " + money(p.pair_price) : "")), sw),
      el("div", {class: "opts"},
        p.colours.length ? [el("small", {}, "الألوان — اضغط على اللون إذا خلص أو رجع"), el("div", {class: "chips"}, p.colours.map(o => opt("colours", o)))] : el("small", {}, "الزبون يكتب اللون بنفسه"),
        el("small", {}, "القياسات"), el("div", {class: "chips"}, p.sizes.map(o => opt("sizes", o)))),
      el("div", {class: "tools"},
        el("button", {class: "btn", type: "button", "data-tip": "تعديل الاسم والسعر والصور والألوان والقياسات", onclick: () => edit(p)}, "✎ تعديل"),
        el("button", {class: "btn btn-ghost", type: "button", "data-tip": "يسوي نسخة من القطعة (مخفية) حتى تعدّلها لموديل جديد بسرعة", onclick: () => duplicate(p)}, "⧉ نسخة"),
        query ? null : el("button", {class: "icon-btn", type: "button", "data-tip": "يطلّع القطعة لفوگ بترتيب الصفحة", disabled: i === 0, onclick: () => move(i, -1)}, "↑"),
        query ? null : el("button", {class: "icon-btn", type: "button", "data-tip": "ينزّل القطعة لجوه بترتيب الصفحة", disabled: i === products().length - 1, onclick: () => move(i, 1)}, "↓")));
  }

  async function duplicate(p) {
    const copy = Object.assign(JSON.parse(JSON.stringify(p)), {id: null, name: (p.name + " (نسخة)").slice(0, 80), active: false});
    try { await save(copy, "انسوت نسخة مخفية، عدّلها وفعّلها"); paint(); } catch (e) { KFT.toast(e.message, true); }
  }

  function paint() {
    const keep = document.activeElement && document.activeElement.id === "psearch";
    root.innerHTML = "";
    const search = el("input", {class: "input", id: "psearch", type: "search", placeholder: "ابحث عن قطعة…", value: query, "data-tip": "اكتب جزء من اسم القطعة حتى تلگاها بسرعة"});
    search.addEventListener("input", () => { query = search.value.trim(); paint(); });
    const list = products().map((p, i) => [p, i]).filter(([p]) => !query || p.name.includes(query));
    root.append(el("div", {class: "toolbar"}, search,
        el("button", {class: "btn btn-gold", type: "button", "data-tip": "ضيف قطعة جديدة للصفحة، ويا صورها وألوانها وقياساتها", onclick: () => edit(null)}, "+ منتج جديد")),
      el("p", {class: "hint", style: "margin:-4px 2px 10px"}, "كل تغيير يطلع للزبائن فوراً. وگّف الماوس على أي زر حتى تشوف شنو يسوي."),
      el("div", {class: "plist"}, list.map(([p, i]) => row(p, i))));
    if (!list.length) root.append(el("div", {class: "empty"}, query ? "ما لگينا قطعة بهالاسم" : "ما اكو منتجات. ضيف أول منتج."));
    if (keep) { const s = document.getElementById("psearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  function optEditor(title, tip, items, placeholder, presets) {
    const box = el("div", {class: "optlist"}), input = el("input", {class: "input", placeholder});
    const draw = () => { box.innerHTML = ""; items.forEach((o, i) => box.append(el("span", {class: "opt" + (o.ok ? "" : " off")}, o.n,
      el("button", {type: "button", "data-tip": o.ok ? "متوفر — اضغط إذا خلص" : "خالص — اضغط إذا رجع", onclick: () => { o.ok = !o.ok; draw(); }}, o.ok ? "✓" : "↺"),
      el("button", {type: "button", "data-tip": "شيل هذا من القائمة نهائياً", onclick: () => { items.splice(i, 1); draw(); }}, "✕")))); };
    const add = () => { input.value.split(/[،,]/).map(s => s.trim()).filter(Boolean).forEach(n => { if (!items.some(o => o.n === n)) items.push({n, ok: true}); }); input.value = ""; draw(); };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    draw();
    return el("div", {class: "field"}, el("span", {}, title, el("i", {class: "help", "data-tip": tip}, "؟")), box,
      el("div", {class: "addrow"}, input, el("button", {class: "btn", type: "button", onclick: add}, "ضيف")),
      presets ? el("div", {class: "presets"}, Object.entries(presets).map(([k, v]) => el("button", {class: "chip", type: "button", "data-tip": "يضيف القياسات " + v.join("، "),
        onclick: () => { v.forEach(n => { if (!items.some(o => o.n === n)) items.push({n, ok: true}); }); draw(); }}, "+ " + k))) : null);
  }

  function moneyField(label, tip, value) {
    const i = moneyInput(value, {placeholder: "مثلاً 20,000"});
    return {node: el("label", {class: "field"}, el("span", {}, label, el("i", {class: "help", "data-tip": tip}, "؟")),
      el("div", {class: "cur"}, i, el("b", {}, "د.ع"))), get: () => toInt(i.value)};
  }

  function photos(d) {
    d.images = d.images || [];
    const box = el("div", {class: "photos"});
    const file = el("input", {type: "file", accept: "image/*", multiple: true, class: "sr"});
    const drop = el("label", {class: "dropzone", "data-tip": "اضغط حتى تختار صور من الجهاز، أو اسحب الصور وذبها هنا. أول صورة تصير الرئيسية"},
      file, el("b", {}, "+ ضيف صور"), el("small", {}, "لحد 6 صور · تنضغط تلقائياً حتى تفتح بسرعة"));
    const draw = () => {
      box.innerHTML = "";
      d.images.forEach((u, i) => box.append(el("div", {class: "ph-item"},
        el("img", {src: u, alt: "", loading: "lazy"}), i === 0 ? el("span", {class: "main"}, "الرئيسية") : null,
        el("div", {class: "ph-tools"},
          i ? el("button", {type: "button", "data-tip": "خلّيها الصورة الرئيسية (تطلع على البطاقة)", onclick: () => { d.images.unshift(d.images.splice(i, 1)[0]); draw(); }}, "★") : null,
          el("button", {type: "button", "data-tip": "شيل الصورة", onclick: () => { d.images.splice(i, 1); draw(); }}, "✕")))));
      drop.classList.toggle("hidden", d.images.length >= 6);
    };
    async function addFiles(files) {
      const list = [...files].filter(f => f.type.startsWith("image/")).slice(0, 6 - d.images.length);
      for (const f of list) {
        const holder = el("div", {class: "ph-item loading"}, el("span", {class: "spin"}));
        box.append(holder);
        try { const blob = await KFT.shrinkImage(f); d.images.push(await KFT.uploadImage(Admin.state.token, blob)); }
        catch (e) { KFT.toast(e.message, true); if (e.code === "28000") return; }
        draw();
      }
    }
    file.addEventListener("change", () => { addFiles(file.files); file.value = ""; });
    ["dragover", "dragenter"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(t => drop.addEventListener(t, () => drop.classList.remove("over")));
    drop.addEventListener("drop", e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
    draw();
    return el("div", {class: "field"}, el("span", {}, "الصور", el("i", {class: "help", "data-tip": "صور واضحة بضوء النهار تبيع أكثر. أول صورة هي اللي تطلع على بطاقة القطعة"}, "؟")), box, drop);
  }

  function edit(p) {
    const d = p ? JSON.parse(JSON.stringify(p)) : {name: "", description: "", price: "", old_price: null, pair_price: null, sizes: [], colours: [], free_colour: false, note: "", active: true, images: []};
    const sheetEl = document.getElementById("eSheet"); sheetEl.innerHTML = "";
    const name = el("input", {class: "input", value: d.name, maxlength: 80, placeholder: "مثلاً: بولو قطن شتوي"});
    const desc = el("input", {class: "input", value: d.description, maxlength: 160, placeholder: "سطر قصير: الخامة أو الميزة"});
    const note = el("input", {class: "input", value: d.note, maxlength: 120, placeholder: "مثلاً: من وزن 70 لحد 150 كيلو"});
    const price = moneyField("السعر", "سعر القطعة الوحدة اللي يدفعه الزبون", d.price);
    const old = moneyField("السعر قبل التخفيض", "اختياري. إذا كتبته يطلع مشطوب جنب السعر ويا علامة «تخفيض». لازم يكون أكبر من السعر", d.old_price);
    const pair = moneyField("سعر القطعتين", "اختياري. عرض «القطعتين بسعر أقل». ينحسب تلقائياً حتى لو القطعتين بألوان أو قياسات مختلفة", d.pair_price);
    const free = el("input", {type: "checkbox", checked: d.free_colour});
    const active = el("input", {type: "checkbox", checked: d.active});
    const err = el("p", {class: "err", role: "alert"});
    const label = p ? "حفظ التعديلات" : "إضافة المنتج";
    const btn = el("button", {class: "btn btn-gold btn-block btn-lg", type: "button"}, label);
    btn.onclick = async () => {
      err.textContent = "";
      const body = Object.assign({}, d, {name: name.value.trim(), description: desc.value.trim(), note: note.value.trim(),
        price: price.get(), old_price: old.get() || null, pair_price: pair.get() || null, free_colour: free.checked, active: active.checked});
      if (body.name.length < 2) return (err.textContent = "اكتب اسم المنتج");
      if (!body.price) return (err.textContent = "اكتب السعر");
      if (body.old_price && body.old_price <= body.price) return (err.textContent = "السعر قبل التخفيض لازم يكون أكبر من السعر الحالي");
      if (!body.sizes.length) return (err.textContent = "ضيف قياس واحد على الأقل");
      if (sheetEl.querySelector(".ph-item.loading")) return (err.textContent = "انتظر لحد ما تخلص الصور تترفع");
      btn.disabled = true; btn.textContent = "نحفظ…";
      try { await save(body, p ? "انحفظ ✓" : "انضاف المنتج ✓"); eSheet.close(); paint(); }
      catch (e) { err.textContent = e.message; }
      finally { btn.disabled = false; btn.textContent = label; }
    };
    const del = p ? el("button", {class: "btn btn-danger btn-block", type: "button", style: "margin-top:10px", "data-tip": "ينشال من صفحة الزبائن. الطلبات القديمة ما تتأثر", onclick: () => {
      if (sheetEl.querySelector(".confirm")) return;
      sheetEl.append(el("div", {class: "confirm"}, el("p", {style: "margin:0 0 10px"}, "متأكد تريد تحذف «" + p.name + "»؟ راح ينشال من صفحة الزبائن. الطلبات القديمة تبقى."),
        el("div", {class: "grid-2"}, el("button", {class: "btn btn-danger", type: "button", onclick: async () => {
          try { await Admin.call("kft_admin_delete_product", {p_id: p.id}); Admin.state.data.products = products().filter(x => x.id !== p.id); KFT.toast("انحذف"); eSheet.close(); paint(); }
          catch (e) { err.textContent = e.message; } }}, "إي، احذفه"),
          el("button", {class: "btn", type: "button", onclick: e => e.target.closest(".confirm").remove()}, "لا"))));
      sheetEl.lastChild.scrollIntoView({behavior: "smooth"}); }}, "حذف المنتج") : null;
    sheetEl.append(...[el("div", {class: "grab"}), el("h3", {}, p ? "تعديل: " + p.name : "منتج جديد"), el("div", {style: "height:10px"}),
      photos(d),
      el("label", {class: "field"}, el("span", {}, "اسم المنتج"), name),
      el("label", {class: "field"}, el("span", {}, "وصف قصير", el("i", {class: "help", "data-tip": "سطر واحد يطلع تحت الاسم، مثل الخامة: قطن 100%"}, "؟")), desc),
      price.node, el("div", {class: "grid-2"}, old.node, pair.node),
      optEditor("الألوان", "اكتب اسم اللون مثل ما تگوله للزبون. تگدر تكتب أكثر من لون بينهم فارزة", d.colours, "مثلاً: أسود، رصاصي"),
      el("div", {class: "setrow", "data-tip": "فعّلها إذا الألوان كثيرة وتريد الزبون يكتب اللون اللي شافه بالإعلان"}, el("span", {}, "الزبون يكتب اللون بنفسه"), el("label", {class: "switch"}, free, el("span", {class: "track"}))),
      optEditor("القياسات", "القياسات المتوفرة. الأزرار الجاهزة تضيف المجموعة كلها بضغطة", d.sizes, "مثلاً XL", PRESETS),
      el("label", {class: "field"}, el("span", {}, "ملاحظة القياس", el("i", {class: "help", "data-tip": "تطلع للزبون تحت القياسات حتى يختار صح"}, "؟")), note),
      el("div", {class: "setrow", "data-tip": "إذا طفيتها القطعة ما تطلع للزبائن بس تبقى محفوظة"}, el("span", {}, "ظاهر للزبائن"), el("label", {class: "switch"}, active, el("span", {class: "track"}))),
      err, btn, del].filter(Boolean));
    eSheet.open();
  }

  Admin.tabs.products = {render: paint, refresh: paint};
})();
