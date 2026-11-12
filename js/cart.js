// Basket state. Totals always come from the server (kft_quote) so the price rules live in one place.
window.Cart = (() => {
  const KEY = "kft-cart-v3";
  const MAX_LINES = 40, MAX_QTY = 500;
  let lines = KFT.store.get(KEY, []);
  if (!Array.isArray(lines)) lines = [];
  let quote = null, quoteErr = "", loading = false, seq = 0, timer = null;
  const subs = [];

  const emit = () => subs.forEach(f => f());
  const save = () => KFT.store.set(KEY, lines);
  const same = (a, b) => !a.custom && !b.custom && a.pid === b.pid && a.colour === b.colour && a.size === b.size;

  function changed() { save(); quote = null; quoteErr = ""; emit(); schedule(); }
  function schedule() {
    clearTimeout(timer);
    if (!lines.length) { loading = false; emit(); return; }
    loading = true;
    timer = setTimeout(refresh, 250);
  }
  async function refresh() {
    const my = ++seq;
    try {
      const q = await KFT.rpc("kft_quote", {p_items: payload()});
      if (my !== seq) return;
      quote = q; quoteErr = "";
    } catch (e) {
      if (my !== seq) return;
      quote = null; quoteErr = e.message;
    }
    loading = false; emit();
  }
  const payload = () => lines.map(l => l.custom
    ? {custom: true, name: l.name, colour: l.colour || "", size: l.size || "", qty: l.qty}
    : {pid: l.pid, colour: l.colour, size: l.size, qty: l.qty});

  return {
    MAX_QTY,
    get lines() { return lines; },
    get quote() { return quote; },
    get error() { return quoteErr; },
    get loading() { return loading; },
    pieces: () => lines.reduce((s, l) => s + l.qty, 0),
    payload,
    onChange(f) { subs.push(f); },
    add(line) {
      const hit = lines.find(l => same(l, line));
      if (hit) hit.qty = Math.min(MAX_QTY, hit.qty + line.qty);
      else if (lines.length >= MAX_LINES) return false;
      else lines.push(line);
      changed(); return true;
    },
    setQty(i, q) { if (lines[i]) { lines[i].qty = Math.max(1, Math.min(MAX_QTY, q)); changed(); } },
    remove(i) { lines.splice(i, 1); changed(); },
    clear() { lines = []; changed(); },
    // Drop lines whose product disappeared from the live catalogue.
    prune(products) {
      const ids = new Set(products.map(p => p.id));
      const before = lines.length;
      lines = lines.filter(l => l.custom || ids.has(l.pid));
      if (lines.length !== before) { changed(); return before - lines.length; }
      if (lines.length) schedule();
      return 0;
    },
  };
})();
