// Orders tab: filter, search, status changes, contact the customer.
(() => {
  const {el, money} = KFT;
  const root = document.getElementById("tab-orders");
  const STATUS = {new: "جديد", confirmed: "مثبّت", shipped: "انشحن", delivered: "وصل", returned: "راجع", cancelled: "ملغي"};
  const NEXT = {new: ["confirmed", "cancelled"], confirmed: ["shipped", "cancelled"], shipped: ["delivered", "returned"],
                delivered: ["returned"], returned: ["new"], cancelled: ["new"]};
  const LABEL = {confirmed: "✓ ثبّت", shipped: "🚚 انشحن", delivered: "📦 وصل", returned: "↩ راجع", cancelled: "✕ إلغاء", new: "↺ رجّعه جديد"};
  const st = {status: "", q: "", list: [], more: false, loading: false, built: false};
  let listEl, moreBtn, searchT;

  const ago = iso => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return "هسه"; if (m < 60) return "قبل " + m + " دقيقة";
    const h = Math.round(m / 60); if (h < 24) return "قبل " + h + " ساعة";
    return new Date(iso).toLocaleDateString("ar-IQ", {day: "numeric", month: "short"}) + " " + new Date(iso).toLocaleTimeString("ar-IQ", {hour: "numeric", minute: "2-digit"});
  };
  const waCustomer = o => "https://wa.me/964" + o.phone.slice(1) + "?text=" +
    encodeURIComponent("هلا " + o.customer_name + " 🌹 من مجمع قفطان، بخصوص طلبك " + o.ref + ":\n");

  async function fetchList(append) {
    if (st.loading) return; st.loading = true;
    const before = append && st.list.length ? st.list[st.list.length - 1].created_at : null;
    try {
      const rows = await Admin.call("kft_admin_orders", {p_status: st.status || null, p_search: st.q || null, p_limit: 30, p_before: before});
      st.list = append ? st.list.concat(rows) : rows; st.more = rows.length === 30;
    } catch (e) { KFT.toast(e.message, true); }
    st.loading = false; paint();
  }

  async function setStatus(o, status, card) {
    card.querySelectorAll("button").forEach(b => b.disabled = true);
    try {
      const u = await Admin.call("kft_admin_order_status", {p_id: o.id, p_status: status});
      Object.assign(o, u); KFT.toast("صار الطلب: " + STATUS[status]);
      if (st.status && st.status !== status) st.list = st.list.filter(x => x.id !== o.id);
      paint(); Admin.loadData().catch(() => {});
    } catch (e) { KFT.toast(e.message, true); card.querySelectorAll("button").forEach(b => b.disabled = false); }
  }

  function editNote(o, card) {
    if (card.querySelector(".noteedit")) return;
    const ta = el("textarea", {class: "input", placeholder: "ملاحظة للفريق (مثلاً: اتصلنا، يريد التوصيل بعد العصر)"});
    ta.value = o.staff_note || "";
    const box = el("div", {class: "noteedit", style: "margin-top:10px"}, ta,
      el("div", {class: "acts"},
        el("button", {class: "btn btn-gold", type: "button", onclick: async () => {
          try { Object.assign(o, await Admin.call("kft_admin_order_status", {p_id: o.id, p_status: o.status, p_staff_note: ta.value.trim()})); KFT.toast("انحفظت الملاحظة"); paint(); }
          catch (e) { KFT.toast(e.message, true); } }}, "حفظ الملاحظة"),
        el("button", {class: "btn btn-ghost", type: "button", onclick: () => box.remove()}, "إلغاء")));
    card.append(box); ta.focus();
  }

  function card(o) {
    const c = el("article", {class: "order" + (o.status === "new" ? " new" : "")});
    const items = el("ul", {}, o.items.map(it => el("li", {}, (it.custom ? "خاصة: " + it.name : it.name) + " — " +
      [it.colour, it.size === "ما أعرف" ? "قياس حسب الوزن" : it.size].filter(Boolean).join(" · ") + " × " + it.qty)));
    c.append(...[
      el("div", {class: "head"}, el("div", {}, el("div", {class: "ref"}, o.ref), el("div", {class: "when"}, ago(o.created_at))),
        el("span", {class: "pill st-" + o.status}, STATUS[o.status])),
      el("div", {class: "cust"}, el("b", {}, o.customer_name), " · ", o.governorate, el("br"),
        el("a", {href: "tel:" + o.phone}, o.phone), " · ", o.address),
      items,
      (o.weight || o.height) ? el("div", {class: "note"}, "الوزن " + (o.weight || "—") + " كيلو · الطول " + (o.height || "—") + " سم") : null,
      o.note ? el("div", {class: "note"}, "ملاحظة الزبون: " + o.note) : null,
      o.staff_note ? el("div", {class: "note"}, "📝 " + o.staff_note) : null,
      el("div", {class: "flags"}, o.is_wholesale ? el("span", {class: "pill st-new"}, "جملة") : null, o.has_custom ? el("span", {class: "pill st-shipped"}, "بيه قطع خاصة") : null,
        o.discount > 0 ? el("span", {class: "pill st-delivered"}, "خصم " + money(o.discount)) : null),
      el("div", {class: "money"}, el("span", {}, o.pieces + " قطعة · توصيل " + (o.delivery ? money(o.delivery) : "مجاني")), el("span", {}, money(o.total))),
      el("div", {class: "acts"},
        NEXT[o.status].map(s => el("button", {class: "btn" + (s === "cancelled" || s === "returned" ? " btn-danger" : s === "new" ? "" : " btn-gold"), type: "button",
          onclick: () => setStatus(o, s, c)}, LABEL[s])),
        el("a", {class: "btn btn-wa", href: waCustomer(o), target: "_blank", rel: "noopener"}, "واتساب"),
        el("button", {class: "btn btn-ghost", type: "button", onclick: () => editNote(o, c)}, "📝 ملاحظة"))].filter(Boolean));
    return c;
  }

  function paint() {
    if (!st.built) return;
    listEl.innerHTML = "";
    if (!st.list.length) listEl.append(el("div", {class: "empty"}, st.loading ? "نحمّل…" : st.q || st.status ? "ما اكو طلبات بهالفلتر" : "بعد ما اكو طلبات. شارك رابط صفحة الطلب ويا الزبائن 🌟"));
    st.list.forEach(o => listEl.append(card(o)));
    moreBtn.classList.toggle("hidden", !st.more);
    root.querySelectorAll(".filters .chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.s === st.status)));
  }

  function build() {
    const search = el("input", {class: "input", type: "search", placeholder: "ابحث برقم الطلب أو الهاتف أو الاسم"});
    search.addEventListener("input", () => { clearTimeout(searchT); searchT = setTimeout(() => { st.q = search.value.trim(); fetchList(false); }, 350); });
    const filters = el("div", {class: "filters"}, [["", "الكل"], ...Object.entries(STATUS)].map(([s, l]) =>
      el("button", {class: "chip", type: "button", "data-s": s, onclick: () => { st.status = s; fetchList(false); }}, l)));
    listEl = el("div", {class: "orders"});
    moreBtn = el("button", {class: "btn btn-block hidden", type: "button", style: "margin-top:12px", onclick: () => fetchList(true)}, "عرض طلبات أقدم");
    root.append(el("div", {class: "toolbar"}, search, el("button", {class: "btn", type: "button", onclick: () => fetchList(false)}, "↻ تحديث")), filters, listEl, moreBtn);
    st.built = true;
  }

  Admin.tabs.orders = {
    render() { if (!st.built) { build(); st.status = "new"; } fetchList(false); },
    refresh() { fetchList(false); },
  };
})();
