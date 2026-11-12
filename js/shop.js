// Catalogue page: header perks, product grid, product picker sheet.
window.Shop = (() => {
  const {el, money, swatch, toInt} = KFT;
  const $ = id => document.getElementById(id);
  const UNKNOWN = "ما أعرف";
  const state = {settings: null, products: []};
  const pSheet = KFT.sheet($("pSheet"));

  async function load() {
    $("loadErr").classList.add("hidden");
    try {
      const d = await KFT.rpc("kft_catalog");
      state.settings = d.settings; state.products = d.products;
      renderHeader(); renderGrid();
      const dropped = Cart.prune(d.products);
      if (dropped) KFT.toast("شلنا من سلتك قطعة صارت غير متوفرة");
      document.dispatchEvent(new Event("kft:ready"));
    } catch (e) {
      $("grid").innerHTML = "";
      $("loadErr").classList.remove("hidden");
    }
  }

  function renderHeader() {
    const s = state.settings, a = $("announce"); a.innerHTML = "";
    if (s.discount_active && s.discount_value > 0) {
      const v = s.discount_type === "percent" ? "خصم " + s.discount_value + "%" : "خصم " + money(s.discount_value);
      a.append(el("div", {class: "announce discount"},
        (s.discount_label ? "🏷️ " + s.discount_label + ": " + v : "🏷️ " + v) + (s.discount_min > 0 ? " على الطلب من " + money(s.discount_min) + " وفوق" : " على كل الطلبات")));
    }
    if (s.announcement) a.append(el("div", {class: "announce"}, s.announcement));
    const perks = $("perks"); perks.innerHTML = "";
    perks.append(...[
      el("span", {class: "perk"}, "🚚 التوصيل ", el("b", {}, s.delivery_fee ? money(s.delivery_fee) : "مجاني"), " لكل المحافظات"),
      s.free_delivery_from > 0 ? el("span", {class: "perk"}, "🎁 توصيل مجاني من ", el("b", {}, money(s.free_delivery_from))) : null,
      el("span", {class: "perk"}, "📦 جملة من ", el("b", {}, s.wholesale_from + " قطع")),
      el("span", {class: "perk"}, "✅ تفحص گدام المندوب")].filter(Boolean));
    $("closed").classList.toggle("hidden", s.shop_open);
    $("closed").textContent = s.closed_message;
    $("waDirect").href = "https://wa.me/" + s.whatsapp;
  }

  const allOut = p => (!p.free_colour && p.colours.length && p.colours.every(c => !c.ok)) || p.sizes.every(s => !s.ok);

  function card(p) {
    const out = allOut(p);
    const dots = el("div", {class: "dots"});
    p.colours.filter(c => c.ok).slice(0, 7).forEach(c => dots.append(el("i", {style: "background:" + (swatch(c.n) || "linear-gradient(135deg,#555,#999)"), title: c.n})));
    const okCount = p.colours.filter(c => c.ok).length;
    if (okCount) dots.append(el("small", {}, okCount + " لون"));
    else if (p.free_colour) dots.append(el("small", {}, "ألوان متعددة"));
    return el("button", {class: "pcard", type: "button", disabled: out || !state.settings.shop_open, onclick: () => openProduct(p),
        "aria-label": p.name + " — " + money(p.price)},
      p.images && p.images.length ? img(p.images[0], p.name, "thumb")
        : el("span", {class: "mono", "aria-hidden": "true"}, p.name.replace(/^(بولو|قميص)\s+/, "").trim().charAt(0)),
      el("span", {class: "pbody"},
        el("div", {class: "pname"}, p.name),
        p.description ? el("div", {class: "pdesc"}, p.description) : null,
        dots,
        el("div", {class: "pfoot"},
          el("span", {class: "price"}, money(p.price)),
          p.old_price ? el("span", {class: "old"}, money(p.old_price)) : null,
          p.old_price ? el("span", {class: "tag sale"}, "تخفيض") : null,
          p.pair_price ? el("span", {class: "tag"}, "القطعتين بـ " + money(p.pair_price)) : null,
          out ? el("span", {class: "tag out"}, "نافذ حالياً") : null)),
      out ? null : el("span", {class: "plus", "aria-hidden": "true"}, "+"));
  }

  // Lazy image that fades in once decoded.
  function img(src, alt, cls) {
    const i = el("img", {class: cls, src, alt, loading: "lazy", decoding: "async"});
    i.addEventListener("load", () => i.classList.add("in"));
    i.addEventListener("error", () => i.remove());
    return i;
  }

  function renderGrid() {
    const g = $("grid"); g.innerHTML = "";
    state.products.forEach((p, i) => { const c = card(p); c.style.setProperty("--d", Math.min(i, 10) * 45 + "ms"); g.append(c); });
    g.append(el("button", {class: "pcard custom", type: "button", disabled: !state.settings.shop_open, onclick: openCustom},
      el("span", {class: "mono", "aria-hidden": "true"}, "؟"),
      el("span", {class: "pbody"}, el("div", {class: "pname"}, "قطعة مو موجودة بالقائمة؟"),
        el("div", {class: "pdesc"}, "اكتب شتريد، ونرد عليك بالسعر والتوفر"))));
  }

  function qtyControl(get, set) {
    const input = el("input", {class: "input", inputmode: "numeric", value: get(), "aria-label": "العدد"});
    input.addEventListener("input", () => { const n = toInt(input.value); if (n) set(Math.min(Cart.MAX_QTY, n)); });
    input.addEventListener("blur", () => { input.value = get(); });
    const step = d => { set(Math.max(1, Math.min(Cart.MAX_QTY, get() + d))); input.value = get(); };
    return el("div", {class: "qtyrow"},
      el("button", {class: "icon-btn", type: "button", "aria-label": "نقص", onclick: () => step(-1)}, "−"), input,
      el("button", {class: "icon-btn", type: "button", "aria-label": "زيد", onclick: () => step(1)}, "+"));
  }

  function openProduct(p) {
    // Pre-pick when there is only one choice, so the customer taps less.
    const okColours = p.colours.filter(c => c.ok), okSizes = p.sizes.filter(s => s.ok);
    const sel = {colour: !p.free_colour && okColours.length === 1 ? okColours[0].n : "", size: okSizes.length === 1 ? okSizes[0].n : "", qty: 1};
    const root = $("pSheet");
    const err = el("p", {class: "err", role: "alert"});
    const buyBtn = el("button", {class: "btn btn-gold btn-lg", type: "button"});
    const addBtn = el("button", {class: "btn btn-lg", type: "button"}, "ضيف للسلة");
    const colourBox = el("div", {class: "chips"}), sizeBox = el("div", {class: "chips"});

    const unitTotal = () => p.pair_price ? Math.floor(sel.qty / 2) * p.pair_price + (sel.qty % 2) * p.price : sel.qty * p.price;
    const paint = () => {
      colourBox.innerHTML = "";
      if (p.free_colour) {
        const i = el("input", {class: "input", placeholder: "اكتب اللون اللي عجبك", value: sel.colour});
        i.addEventListener("input", () => { sel.colour = i.value.trim(); err.textContent = ""; });
        colourBox.append(i);
      } else {
        p.colours.forEach(c => colourBox.append(el("button", {class: "chip", type: "button", disabled: !c.ok, "aria-pressed": String(sel.colour === c.n),
          onclick: () => { sel.colour = c.n; err.textContent = ""; paint(); }}, c.n, swatch(c.n) ? el("i", {class: "sw", style: "background:" + swatch(c.n)}) : null, c.ok ? null : " — خلص")));
      }
      sizeBox.innerHTML = "";
      p.sizes.concat([{n: UNKNOWN, ok: true}]).forEach(s => sizeBox.append(el("button", {class: "chip", type: "button", disabled: !s.ok,
        "aria-pressed": String(sel.size === s.n), onclick: () => { sel.size = s.n; err.textContent = ""; paint(); }}, s.n === UNKNOWN ? "ما أعرف قياسي" : s.n)));
      buyBtn.textContent = "اطلب هسه · " + money(unitTotal());
    };
    const take = () => {
      if (!sel.colour) { err.textContent = p.free_colour ? "اكتب اللون" : "اختار اللون"; colourBox.scrollIntoView({behavior: "smooth", block: "center"}); return false; }
      if (!sel.size) { err.textContent = "اختار القياس، أو «ما أعرف قياسي»"; sizeBox.scrollIntoView({behavior: "smooth", block: "center"}); return false; }
      if (!Cart.add({pid: p.id, name: p.name, colour: sel.colour, size: sel.size, qty: sel.qty})) { err.textContent = "السلة وصلت الحد، كمّل الطلب وبعدين سوّي طلب ثاني"; return false; }
      return true;
    };
    buyBtn.onclick = () => { if (take()) { pSheet.close(); setTimeout(() => Checkout.open(), 260); } };
    addBtn.onclick = () => { if (take()) { pSheet.close(); KFT.toast("انضافت للسلة ✓ — كمّل تسوق أو اضغط «إكمال الطلب»"); } };
    root.innerHTML = "";
    root.append(...[el("div", {class: "grab"}),
      p.images && p.images.length ? gallery(p) : null,
      el("h3", {id: "pTitle"}, p.name),
      el("div", {class: "meta"}, el("span", {class: "pricebig"}, money(p.price)), p.old_price ? el("span", {class: "old"}, "  " + money(p.old_price)) : null,
        p.description ? el("div", {}, p.description) : null),
      el("h4", {}, "اللون"), colourBox,
      el("h4", {}, "القياس"), sizeBox,
      p.note ? el("p", {class: "hint"}, "القياسات " + p.sizes[0].n + " لحد " + p.sizes[p.sizes.length - 1].n + " · " + p.note) : null,
      el("h4", {}, "العدد"), qtyControl(() => sel.qty, v => { sel.qty = v; paint(); }),
      p.pair_price ? el("p", {class: "offer"}, "🎁 القطعتين بـ " + money(p.pair_price) + " — حتى لو بألوان أو قياسات مختلفة") : null,
      err, el("div", {class: "buyrow"}, buyBtn, addBtn)].filter(Boolean));
    paint(); pSheet.open();
  }

  function gallery(p) {
    const strip = el("div", {class: "gallery"}, p.images.map((u, i) => img(u, p.name + " — صورة " + (i + 1), "gimg")));
    const dots = p.images.length > 1 ? el("div", {class: "gdots"}, p.images.map((_, i) => el("i", {class: i ? "" : "on"}))) : null;
    if (dots) strip.addEventListener("scroll", () => {
      const k = Math.round(Math.abs(strip.scrollLeft) / strip.clientWidth);
      [...dots.children].forEach((d, i) => d.classList.toggle("on", i === k));
    }, {passive: true});
    return el("div", {class: "gwrap"}, strip, dots);
  }

  function openCustom() {
    const root = $("pSheet"); const err = el("p", {class: "err", role: "alert"});
    const d = el("textarea", {class: "input", placeholder: "مثلاً: قمصلة جلد سودة، بنطرون كاوبوي… وإذا عندك صورة دزها بالواتساب بعد الطلب"});
    const c = el("input", {class: "input"}), s = el("input", {class: "input", placeholder: "مثلاً XL"});
    let qty = 1;
    root.innerHTML = "";
    root.append(el("div", {class: "grab"}), el("h3", {id: "pTitle"}, "قطعة مو موجودة بالقائمة"),
      el("p", {class: "hint"}, "اكتب وصفها، ونأكد وياك السعر والتوفر على الواتساب."),
      el("label", {class: "field"}, el("span", {}, "شنو القطعة؟"), d),
      el("div", {class: "grid-2"}, el("label", {class: "field"}, el("span", {}, "اللون (اختياري)"), c), el("label", {class: "field"}, el("span", {}, "القياس (اختياري)"), s)),
      el("h4", {}, "العدد"), qtyControl(() => qty, v => { qty = v; }), err, el("div", {style: "height:12px"}),
      el("button", {class: "btn btn-gold btn-block btn-lg", type: "button", onclick: () => {
        if (d.value.trim().length < 3) return (err.textContent = "اكتب شنو القطعة");
        Cart.add({custom: true, name: d.value.trim().slice(0, 120), colour: c.value.trim().slice(0, 40), size: s.value.trim().slice(0, 20), qty});
        pSheet.close(); setTimeout(() => Checkout.open(), 260);
      }}, "اطلبها هسه"));
    pSheet.open();
  }

  $("retry").onclick = load;
  load();
  return {state, UNKNOWN};
})();
