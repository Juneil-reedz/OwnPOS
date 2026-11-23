"use strict";
/* =========================================================
   OwnPOS for Android (Capacitor)
   - All store data lives in one JSON file in the app's private storage.
   - Licenses are signed by OwnPOS; this app only holds the public key.
   - Feedback goes to Web3Forms when online, else waits in an outbox.
   - Updates are checked against GitHub Releases.
   ========================================================= */
const CFG = Object.assign({ version: "0.0.0-dev", server: "", web3formsKey: "", repo: "Juneil-reedz/OwnPOS", email: "areedzgonzales@gmail.com", gcashName: "", gcashNumber: "", publicKey: null }, window.OWNPOS_CONFIG || {});
const DAY = 86400000;
const FILE = "ownpos-data.json";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const peso = n => "₱" + (Math.round(n * 100) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const peso0 = n => "₱" + Math.round(n).toLocaleString("en-PH");
const rnd = (n, set = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => set[b % set.length]).join("");

/* ---------- native bridge ---------- */
const Cap = window.Capacitor;
const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const _plugs = {};
const plug = n => { if (!Cap) return null; if (Cap.Plugins && Cap.Plugins[n]) return Cap.Plugins[n]; if (isNative && Cap.registerPlugin) return _plugs[n] || (_plugs[n] = Cap.registerPlugin(n)); return null; };

/* ---------- time ---------- */
const dayNum = t => { const d = new Date(t); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
const fromIso = s => Math.round(Date.parse(s + "T00:00:00Z") / DAY);
const fmtDay = (n, o = {}) => new Date(n * DAY).toLocaleDateString("en-PH", { timeZone: "UTC", month: "short", day: "numeric", ...o });
const fmtDayLong = n => fmtDay(n, { weekday: "short", year: "numeric" });
const fmtTime = t => new Date(t).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const fmtDT = t => new Date(t).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) + ", " + fmtTime(t);

/* ---------- crypto (verify only) ---------- */
const enc = new TextEncoder();
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function verifyLicense(token) {
  try {
    if (!CFG.publicKey) return null;
    const [v, body, sig] = String(token).trim().split(".");
    if (v !== "OWNPOS1" || !body || !sig) return null;
    const pub = await crypto.subtle.importKey("jwk", CFG.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb64u(sig), enc.encode(body));
    return ok ? JSON.parse(new TextDecoder().decode(unb64u(body))) : null;
  } catch (e) { return null; }
}
async function sha(s) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase(); }

/* ---------- storage ---------- */
let P = null;          // all store data
let saveT = null;
async function readFileJSON(path) {
  const fs = plug("Filesystem");
  if (isNative && fs) { const r = await fs.readFile({ path, directory: "DATA", encoding: "utf8" }); return JSON.parse(r.data); }
  const raw = localStorage.getItem("ownpos:" + path); return raw ? JSON.parse(raw) : null;
}
async function writeFileJSON(path, obj) {
  const fs = plug("Filesystem"); const data = JSON.stringify(obj);
  if (isNative && fs) {
    await fs.writeFile({ path: path + ".tmp", directory: "DATA", encoding: "utf8", data });
    try { await fs.deleteFile({ path, directory: "DATA" }); } catch (e) {}
    await fs.rename({ from: path + ".tmp", to: path, directory: "DATA", toDirectory: "DATA" });
  } else { localStorage.setItem("ownpos:" + path, data); }
}
async function loadData() {
  try { return await readFileJSON(FILE); } catch (e) {}
  try { return await readFileJSON(FILE.replace(".json", ".prev.json")); } catch (e) {}
  return null;
}
function save(now) {
  clearTimeout(saveT);
  const run = async () => {
    try {
      await writeFileJSON(FILE, P);
      const today = iso(dayNum(Date.now()));
      if (P.lastDailyCopy !== today) { P.lastDailyCopy = today; await writeFileJSON(FILE.replace(".json", ".prev.json"), P); }
    } catch (e) { toast("Couldn’t save. Check that the device has free space."); }
  };
  if (now) return run();
  saveT = setTimeout(run, 300);
}

/* ---------- menus and themes ---------- */
const TEMPLATES = {
  carinderia: { label: "Carinderia / restaurant", cats: ["Ulam", "Sabaw", "Rice", "Drinks", "Dessert"], items: [
    ["Chicken Adobo", 85, "Ulam"], ["Lechon Kawali", 120, "Ulam"], ["Beef Caldereta", 110, "Ulam"], ["Pinakbet", 70, "Ulam"], ["Tortang Talong", 60, "Ulam"],
    ["Pork Sinigang", 95, "Sabaw"], ["Tinola", 90, "Sabaw"], ["Plain Rice", 15, "Rice"], ["Garlic Rice", 25, "Rice"],
    ["Iced Tea", 30, "Drinks"], ["Bottled Water", 20, "Drinks"], ["Leche Flan", 45, "Dessert"], ["Halo-halo", 75, "Dessert"]] },
  coffee: { label: "Coffee shop", cats: ["Coffee", "Non-coffee", "Pastry", "Add-ons"], items: [
    ["Americano", 110, "Coffee", "Two shots of espresso over ice. Bold and clean."], ["Café Latte", 140, "Coffee", "Espresso with steamed fresh milk."], ["Spanish Latte", 150, "Coffee", "Espresso, milk and condensed milk."], ["Caramel Macchiato", 160, "Coffee", "Vanilla milk, espresso, caramel drizzle."],
    ["Ube Latte", 150, "Non-coffee", "Ube cream and fresh milk."], ["Matcha Latte", 155, "Non-coffee", "Matcha whisked into cold milk."],
    ["Butter Croissant", 95, "Pastry"], ["Ensaymada", 75, "Pastry"], ["Extra Shot", 30, "Add-ons"], ["Oat Milk", 35, "Add-ons"]] },
  milktea: { label: "Milk tea", cats: ["Milk tea", "Fruit tea", "Toppings"], items: [
    ["Classic Pearl", 99, "Milk tea"], ["Wintermelon", 109, "Milk tea"], ["Okinawa", 109, "Milk tea"], ["Taro", 119, "Milk tea"], ["Brown Sugar", 129, "Milk tea"],
    ["Lychee Tea", 99, "Fruit tea"], ["Mango Tea", 99, "Fruit tea"], ["Pearls", 15, "Toppings"], ["Nata de Coco", 15, "Toppings"], ["Cream Cheese", 25, "Toppings"]] },
  other: { label: "Other / start empty", cats: ["Items"], items: [] }
};
const PRESETS = [
  { id: "carinderia", label: "Carinderia", color: "#B3261E", font: "Figtree", corners: "round" },
  { id: "coffee", label: "Coffee shop", color: "#A8714A", font: "Figtree", corners: "round" },
  { id: "milktea", label: "Milk tea", color: "#7B3FC4", font: "Baloo 2", corners: "round" },
  { id: "bakery", label: "Bakery", color: "#B45309", font: "Fraunces", corners: "soft" },
  { id: "fresh", label: "Fresh & green", color: "#166534", font: "Bricolage Grotesque", corners: "soft" },
  { id: "night", label: "Night market", color: "#1E293B", font: "Bricolage Grotesque", corners: "square" }
];
const SWATCHES = ["#B3261E", "#C2410C", "#A8714A", "#B45309", "#166534", "#0F766E", "#1D4ED8", "#7B3FC4", "#BE185D", "#1E293B"];
const FONTS = ["Figtree", "Fraunces", "Baloo 2", "Bricolage Grotesque"];
const menuFrom = tpl => { const t = TEMPLATES[tpl] || TEMPLATES.other; return { categories: t.cats.slice(), products: t.items.map(([name, price, cat, desc]) => ({ id: rnd(6), name, price, cat, desc: desc || "", img: "", on: true })) }; };
const PLANS = [{ id: "Monthly", months: 1, price: 500, label: "1 month" }, { id: "Quarterly", months: 3, price: 1500, label: "3 months" }, { id: "Annual", months: 12, price: 5000, label: "12 months", save: "Save ₱1,000" }];

function newStore({ name, owner, mobile, type }) {
  const m = menuFrom(type); const preset = PRESETS.find(p => p.id === type) || PRESETS[0]; const today = dayNum(Date.now());
  return {
    v: 1, deviceId: "OWN-" + rnd(4) + "-" + rnd(4), secret: rnd(24), createdAt: Date.now(),
    storeType: type, owner: { name: owner, mobile }, trial: { start: today, exp: today + 30 }, license: null, lastSeen: Date.now(),
    brand: { name, tagline: "", address: "", tin: "", logo: "", color: preset.color, font: preset.font, corners: preset.corners, tile: "comfortable", photos: true, footer: "Salamat po! Balik po kayo.", vat: false, receiptLogo: true },
    categories: m.categories, products: m.products, sales: [], seq: 0, outbox: [], role: "owner", orderType: "Dine in",
    lastCheck: 0, lastDailyCopy: "", seenVersion: CFG.version
  };
}

/* ---------- license state ---------- */
let LIC = null;
async function refreshLicense() { LIC = P.license ? await verifyLicense(P.license) : null; if (LIC && LIC.dev !== P.deviceId) LIC = null; }
function clock() { const n = Date.now(); if (n > P.lastSeen) P.lastSeen = n; return { now: Math.max(n, P.lastSeen), suspect: n < P.lastSeen - 3600000 }; }
function stateFor(expDay, today) { const d = expDay - today; if (d > 7) return { key: "active", d }; if (d >= 0) return { key: "expiring", d }; if (d >= -7) return { key: "grace", d, graceLeft: 7 + d }; return { key: "limited", d }; }
function status() {
  const c = clock(), today = dayNum(c.now);
  const exp = LIC ? fromIso(LIC.exp) : P.trial.exp, plan = LIC ? LIC.plan : "Trial", start = LIC ? fromIso(LIC.iat) : P.trial.start;
  return { ...stateFor(exp, today), exp, plan, start, today, suspect: c.suspect };
}
const canSell = st => st.key !== "limited";

/* ---------- sales ---------- */
function computeTotals(items, discount) {
  const sub = items.reduce((a, b) => a + b.price * b.qty, 0);
  let lessVat = 0, disc = 0, total = sub, vatable = 0, vat = 0;
  if (discount === "scpwd") { if (P.brand.vat) { const base = sub / 1.12; lessVat = sub - base; disc = base * 0.2; total = base - disc; } else { disc = sub * 0.2; total = sub - disc; } }
  else if (P.brand.vat) { vatable = sub / 1.12; vat = sub - vatable; }
  return { sub, lessVat, disc, total: Math.round(total * 100) / 100, vatable, vat };
}
async function recordSale({ items, method, tendered, ref, discount, scId, orderType, customer }) {
  const t = computeTotals(items, discount);
  P.seq += 1; const no = String(P.seq).padStart(6, "0"); const time = clock().now;
  const h = await sha([P.deviceId, no, t.total.toFixed(2), time, P.secret].join("|"));
  const sale = { no, ts: time, items, ...t, discount, scId, method, orderType, customer: customer || "", tendered: method === "Cash" ? tendered : t.total, change: method === "Cash" ? Math.max(0, tendered - t.total) : 0, ref, cashier: P.role === "owner" ? "Owner" : "Cashier", code: h.slice(0, 4) + "-" + h.slice(4, 8) };
  P.sales.push(sale); save(true); return sale;
}

/* ---------- brand ---------- */
function inkFor(hex) { const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; const L = [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return (.2126 * L[0] + .7152 * L[1] + .0722 * L[2]) > .4 ? "#1E1B18" : "#FFFFFF"; }
function mixWhite(hex, k) { const n = parseInt(hex.slice(1), 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v * k + 255 * (1 - k))); return "#" + c.map(v => v.toString(16).padStart(2, "0")).join(""); }
function applyBrand() {
  const b = P.brand, r = document.documentElement.style;
  r.setProperty("--brand", b.color); r.setProperty("--brand-ink", inkFor(b.color));
  r.setProperty("--brand-soft", mixWhite(b.color, .14));
  r.setProperty("--font-brand", `"${b.font}", system-ui, sans-serif`);
  r.setProperty("--radius", { round: "18px", soft: "12px", square: "4px" }[b.corners] || "16px");
  r.setProperty("--tile", b.tile === "compact" ? "120px" : "160px");
}
const catColor = cat => { const i = Math.max(0, P.categories.indexOf(cat)); const hues = [18, 200, 145, 280, 330, 50, 170, 0]; return `hsl(${hues[i % hues.length]} 40% 46%)`; };
const initials = s => String(s).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

/* ---------- icons ---------- */
const ICON = {
  sell: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  sales: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  menu: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  brand: '<path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3-3.5 3H16a2 2 0 0 0-1 3.7A1.8 1.8 0 0 1 12 22z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  sub: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  dine: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  take: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  deliv: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'
};
const icon = (n, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

/* ---------- "?" help ---------- */
const HELP = {
  order: ["Current order", "Everything the customer is buying right now. Tap an item on the menu to add it, and use − and + to change how many.", ["Dine in, Take out or Delivery is printed on the receipt so your staff know where the order goes.", "Table / name: type the table number or the customer’s name so you can call them when it’s ready. It’s printed on the receipt too.", "Senior / PWD gives the 20% discount required by law. If you’re VAT-registered, VAT is removed first, then 20% is taken off. You’ll be asked for their ID number.", "Charge opens the payment screen: Cash (with change), GCash or Maya."]],
  receipts: ["Receipts", "Every sale made on this device, newest first. Tap one to see or resend its receipt.", ["Export CSV makes a spreadsheet file of all your sales. Use it for your bookkeeping or send it to your accountant.", "Sales are saved only on this device. Back them up in Settings."]],
  bymethod: ["Today by payment", "How much of today’s sales came in as cash, GCash and Maya.", ["At closing, the Cash amount is what should be in your drawer (plus your starting change)."]],
  verify: ["Check a receipt photo", "Each receipt has a number and a verification code made from the sale’s details.", ["If a customer shows you a photo of a receipt, type its number and code here.", "“Genuine” means this POS really made that receipt for that amount. “No match” means it was edited or isn’t from your store."]],
  items: ["Items", "Your menu. These are the buttons your cashier taps on the Sell screen.", ["Add item to add something new, with a price, category and optional photo.", "Turn the switch off when something is sold out. It stays on the menu but can’t be sold until you turn it back on.", "Edit to change a price or photo. Old receipts keep the price they were sold at."]],
  categories: ["Categories", "Groups for your menu, like Ulam, Drinks or Dessert. They show as the tabs on the Sell screen.", ["Use ↑ to change their order.", "You can only remove a category once no items are in it."]],
  themes: ["Quick themes", "Ready-made looks. One tap sets the colour, font and corner style together.", ["You can still change each part below afterwards."]],
  storedetails: ["Store details", "Your store’s name, logo, tagline, address and TIN.", ["These appear at the top of the app and on every receipt.", "Your TIN is optional. These digital receipts aren’t official BIR invoices."]],
  look: ["Look and feel", "Make OwnPOS look like your brand.", ["Brand colour is used for buttons and highlights.", "Font changes your store name and headings.", "Compact item buttons fit more items on screen. Turn photos off if you don’t use them."]],
  receiptset: ["Receipt", "What your customers see on their receipt.", ["The message at the bottom is a good place for “Salamat po!”, your Facebook page or your Wi-Fi password.", "Tick VAT-registered only if you are registered for VAT with BIR. Your prices are then treated as VAT-inclusive."]],
  rpreview: ["Receipt preview", "How your receipt looks right now. It updates as you change your brand settings."],
  plan: ["Your plan", "How many days you have left on your free trial or paid plan. It’s counted on this device, so it works without internet.", ["When the end date passes, you get 7 more days to renew (the grace period).", "After that, selling pauses, but your records are kept and you can still view and export them.", "Device ID is this tablet’s or phone’s OwnPOS number. OwnPOS uses it to send your license to the right device."]],
  timeline: ["What happens next", "The dates of your reminders and of the end of your plan.", ["You’ll see a banner on these days. No internet needed."]],
  renew: ["Renew OwnPOS", "How to pay for your next month, 3 months or year.", ["1. Pick a plan and send the amount by GCash to the name and number shown.", "2. Type the GCash reference number from your receipt and tap Send renewal request.", "3. Once OwnPOS sees your payment, your new end date arrives on this device by itself when it’s online. Paying for longer saves money: 12 months is ₱5,000 instead of ₱6,000."]],
  activate: ["Activate a license", "Use this only if OwnPOS sent you a license code by message, for example if this device was offline for a long time.", ["Scan license QR opens the camera. Point it at the QR code OwnPOS shows you.", "Or paste the whole message OwnPOS sent and tap Activate code."]],
  updates: ["Updates", "New versions of OwnPOS with fixes and new features.", ["When one is ready, an update window opens and a yellow “Update to…” button appears at the top.", "Tap Update now. It downloads inside OwnPOS, then Android asks you to confirm. Tap Update, then Open.", "The first time, Android asks you to allow OwnPOS to install updates. Turn it on once.", "Updating keeps your sales, menu, brand and license.", "Updates never interrupt a sale. Finish the current order first."]],
  backup: ["Back up your data", "Your data lives only on this device. If it’s lost, broken or reset, your records go with it, unless you have a backup.", ["Save a backup makes one file with all your sales, menu and brand. Save it to Google Drive or email it to yourself.", "Restore from backup puts that file’s data on this device, for example on a new tablet. It replaces what’s there now."]],
  feedback: ["Feedback", "Send ideas, problems or praise to the OwnPOS team.", ["If you’re offline, it’s saved and sent automatically when the internet comes back.", "Add your email if you’d like a reply."]],
  about: ["About this device", "Your store’s OwnPOS details. If you contact OwnPOS for help, they may ask for your Device ID."],
  role: ["Owner or Cashier", "Cashier mode shows only Sell and Sales, so staff can’t change prices, the menu or your plan."]
};
const hb = k => `<button class="help" data-act="help" data-v="${k}" aria-label="What is this?">?</button>`;
/* ---------- UI helpers ---------- */
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), 2800); }
function openModal(html, wide) { $("#mbox").className = "box" + (wide ? " wide" : ""); $("#mbox").innerHTML = html; $("#modal").classList.remove("hidden"); drawQRs($("#mbox")); }
function closeModal() { $("#modal").classList.add("hidden"); $("#mbox").innerHTML = ""; }
const modalOpen = () => !$("#modal").classList.contains("hidden");
const ascii = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/₱/g, "PHP ").replace(/[^\x20-\x7E\n]/g, "");
const qr = (text, size = 150) => `<div data-qr="${esc(ascii(text))}" data-size="${size}" style="width:${size}px;height:${size}px"></div>`;
function drawQRs(root) {
  root.querySelectorAll("[data-qr]").forEach(el => {
    if (el.dataset.done) return; el.dataset.done = 1;
    try { new QRCode(el, { text: el.dataset.qr, width: +el.dataset.size, height: +el.dataset.size, colorDark: "#111111", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L }); }
    catch (e) { el.textContent = "QR unavailable"; }
  });
}
function readImage(file, max) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", .85)); }; img.onerror = rej; img.src = fr.result; }; fr.onerror = rej; fr.readAsDataURL(file); });
}
async function shareText(title, text) {
  const sh = plug("Share");
  try { if (isNative && sh) { await sh.share({ title, text, dialogTitle: title }); return; } if (navigator.share) { await navigator.share({ title, text }); return; } await navigator.clipboard.writeText(text); toast("Copied"); } catch (e) {}
}
async function shareFile(name, data, mime) {
  const fs = plug("Filesystem"), sh = plug("Share");
  if (isNative && fs && sh) {
    await fs.writeFile({ path: name, directory: "CACHE", encoding: "utf8", data });
    const { uri } = await fs.getUri({ path: name, directory: "CACHE" });
    await sh.share({ title: name, files: [uri], dialogTitle: "Save or send " + name });
  } else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: mime })); a.download = name; a.click(); }
}
async function openUrl(url) { const br = plug("Browser"); if (isNative && br) { await br.open({ url }); } else { window.open(url, "_blank"); } }

/* ---------- network ---------- */
let online = navigator.onLine;
async function initNetwork() {
  const nw = plug("Network");
  if (isNative && nw) { try { online = (await nw.getStatus()).connected; } catch (e) {} nw.addListener("networkStatusChange", s => { const was = online; online = s.connected; if (online && !was) onReconnect(); render(); }); }
  else { addEventListener("online", () => { online = true; onReconnect(); render(); }); addEventListener("offline", () => { online = false; render(); }); }
}
function onReconnect() { flushOutbox(); checkUpdates(); checkin(); }

/* ---------- OwnPOS server (store list, licenses, feedback) ---------- */
async function api(body) {
  if (!CFG.server || !online) return null;
  const r = await fetch(CFG.server, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ deviceId: P.deviceId }, body)) });
  const j = await r.json(); return j && j.ok ? j : null;
}
let checking = false;
async function checkin() {
  if (!P || checking || !CFG.server || !online) return;
  checking = true;
  try {
    const st = status();
    const j = await api({ action: "checkin", store: P.brand.name, owner: P.owner.name, mobile: P.owner.mobile, storeType: P.storeType || "", version: CFG.version, plan: st.plan, start: iso(st.start), exp: iso(st.exp), device: deviceInfo });
    if (j && j.license && j.license !== P.license) {
      const pl = await verifyLicense(j.license), cur = LIC ? fromIso(LIC.exp) : P.trial.exp;
      if (pl && pl.dev === P.deviceId && fromIso(pl.exp) > cur) {
        P.license = j.license; P.lastRequest = null; await refreshLicense(); save(true); render();
        openModal(`<div class="mhead"><h2>OwnPOS renewed</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div><p>Salamat! Your payment was confirmed. OwnPOS is active until <b>${fmtDayLong(fromIso(pl.exp))}</b>.</p><button class="btn primary block" data-act="closemodal">OK</button>`);
        checking = false; return checkin();
      }
    }
    if (j) { P.lastCheckin = Date.now(); save(); }
  } catch (e) {}
  checking = false;
}

/* =========================================================
   RENDER
   ========================================================= */
let custName = "", tab = "sell", cart = [], activeCat = null, query = "", discount = "none", pay = null, subMsg = null, setupType = "carinderia";

function render() {
  const app = $("#app");
  if (!P) { app.innerHTML = renderSetup(); return; }
  applyBrand();
  const st = status(), owner = P.role === "owner";
  const tabs = owner ? [["sell", "Sell"], ["sales", "Sales"], ["menu", "Menu"], ["brand", "Brand"], ["sub", "Subscription"], ["settings", "Settings"]] : [["sell", "Sell"], ["sales", "Sales"]];
  if (!tabs.some(t => t[0] === tab)) tab = "sell";
  const titles = { sell: "Sell", sales: "Sales", menu: "Menu", brand: "Make it yours", sub: "Subscription", settings: "Settings" };
  const b = P.brand, upd = update;
  const logo = `${b.logo ? `<img src="${b.logo}" alt="">` : `<div class="ph">${esc(initials(b.name) || "S")}</div>`}<div class="name">${esc(b.name)}</div>`;
  const body = { sell: renderSell, sales: renderSales, menu: renderMenu, brand: renderBrand, sub: renderSub, settings: renderSettings }[tab](st);
  const total = Math.max(1, st.exp - st.start), used = Math.min(total, Math.max(0, st.today - st.start));
  app.innerHTML = `<div class="shell ${b.photos ? "" : "nophotos"}">
    <aside class="side">
      <div class="logo">${logo}</div>
      <nav class="nav" aria-label="Main">${tabs.map(([k, l]) => `<button data-act="tab" data-v="${k}" ${tab === k ? 'aria-current="page"' : ""}>${icon(k)}${l}</button>`).join("")}</nav>
      <div class="grow"></div>
      ${owner ? `<button class="plancard" data-act="tab" data-v="sub"><b class="small">${st.plan === "Trial" ? "Free trial" : st.plan + " plan"}</b><span class="small muted">${planLine(st)}</span><div class="bar"><i style="width:${(used / total) * 100}%"></i></div></button>` : ""}
      <div class="role"><label for="roleSel">Signed in as</label><select id="roleSel" data-act-change="role"><option value="owner" ${owner ? "selected" : ""}>Owner</option><option value="cashier" ${!owner ? "selected" : ""}>Cashier</option></select>${hb("role")}</div>
    </aside>
    <div class="main">
      <div class="phonehead"><div class="logo">${logo}</div><select class="inp" style="width:auto;min-height:38px;padding:6px 8px;font-size:13px" data-act-change="role" aria-label="Signed in as"><option value="owner" ${owner ? "selected" : ""}>Owner</option><option value="cashier" ${!owner ? "selected" : ""}>Cashier</option></select></div>
      <div class="topbar"><h1>${titles[tab]}</h1>
        ${upd ? `<button class="updpill" data-act="openupdate">Update to ${esc(upd.version)}</button>` : ""}
        ${online ? "" : `<span class="offchip">Offline</span>`}
        <button class="iconbtn" data-act="openfeedback" aria-label="Send feedback">${icon("chat")}</button></div>
      <div class="content">${owner ? banners(st) : (!canSell(st) ? `<div class="banner bad"><div class="grow">Selling is paused. Please ask the owner to renew OwnPOS.</div></div>` : "")}${body}</div>
      <nav class="bottomnav" aria-label="Main">${tabs.map(([k, l]) => `<button data-act="tab" data-v="${k}" ${tab === k ? 'aria-current="page"' : ""}>${icon(k)}${l === "Subscription" ? "Plan" : l}</button>`).join("")}</nav>
    </div></div>`;
  drawQRs(app);
}
function planLine(st) {
  if (st.key === "active") return `${st.d} days left · ends ${fmtDay(st.exp)}`;
  if (st.key === "expiring") return st.d === 0 ? "Ends today" : st.d === 1 ? "Ends tomorrow" : `${st.d} days left · ends ${fmtDay(st.exp)}`;
  if (st.key === "grace") return `Expired · ${st.graceLeft} day${st.graceLeft === 1 ? "" : "s"} to renew`;
  return "Selling paused · renew to continue";
}
function banners(st) {
  let out = "";
  if (st.suspect) out += `<div class="banner bad"><div class="grow">This device’s date looks wrong. It’s earlier than your last sale, so OwnPOS keeps counting from ${fmtDay(dayNum(P.lastSeen))}. Fix the date in Android settings.</div></div>`;
  if (tab === "sub") return out;
  const what = st.plan === "Trial" ? "free trial" : "subscription";
  if (st.key === "expiring") out += `<div class="banner warn"><div class="grow">Your ${what} ${st.d === 0 ? "ends today" : st.d === 1 ? "ends tomorrow" : `ends in ${st.d} days`} (${fmtDay(st.exp)}).</div><button class="btn" data-act="tab" data-v="sub">Renew</button></div>`;
  if (st.key === "grace") out += `<div class="banner bad"><div class="grow">Your ${what} ended on ${fmtDay(st.exp)}. Selling stays on until ${fmtDay(st.exp + 7)}.</div><button class="btn" data-act="tab" data-v="sub">Renew now</button></div>`;
  if (st.key === "limited") out += `<div class="banner bad"><div class="grow">Selling is paused. Your records are safe and you can still view and export them.</div><button class="btn" data-act="tab" data-v="sub">Renew</button></div>`;
  return out;
}

/* ---------- setup ---------- */
function renderSetup() {
  return `<div class="setup"><div class="card stack">
    <div class="brandline"><svg width="34" height="34" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2343D9"/><path d="M20 14H44V46L40 43L36 46L32 43L28 46L24 43L20 46Z" fill="#fff"/><rect x="25" y="21" width="14" height="3" rx="1.5" fill="#2343D9"/><rect x="25" y="28" width="10" height="3" rx="1.5" fill="#2343D9"/><circle cx="45" cy="45" r="9" fill="#FFB627"/><path d="M41 45L44 48L49 42" stroke="#14171C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><b>Own<span>POS</span></b></div>
    <h2 style="font-size:22px">Set up your store</h2>
    <p class="muted" style="margin:0">Free for 30 days. Everything you enter stays on this device.</p>
    <form class="stack" id="setupForm">
      <label class="f" for="s-name">Store name<input class="inp" id="s-name" required placeholder="Kape ni Lito" autocomplete="organization"></label>
      <label class="f" for="s-owner">Your name<input class="inp" id="s-owner" required placeholder="Lito Ramos" autocomplete="name"></label>
      <label class="f" for="s-mobile">Mobile number<input class="inp" id="s-mobile" type="tel" required placeholder="0917 123 4567" autocomplete="tel"></label>
      <div class="f">Type of store<div class="opts">${Object.entries(TEMPLATES).map(([k, t]) => `<button type="button" data-act="setuptype" data-v="${k}" aria-pressed="${setupType === k}">${t.label}</button>`).join("")}</div></div>
      <p class="small muted" style="margin:0">We’ll add a starter menu and colours for this type. You can change everything later.</p>
      <p class="small muted" style="margin:0;background:var(--surface-2);padding:10px 12px;border-radius:12px">Your sales, menu and customers stay on this device. OwnPOS only receives your store name, your name and number, and your plan dates, so we can manage your subscription.</p>
      <button class="btn lg block own" type="submit">Start my free trial</button>
    </form>
    <span class="btn filebtn" style="align-self:center;border:0;color:var(--muted);font-weight:600">Restore from a backup file<input type="file" accept="application/json,.json" data-act-change="restore"></span>
  </div></div>`;
}

/* ---------- sell ---------- */
const cartItems = () => cart.map(l => { const p = P.products.find(x => x.id === l.id); return p ? { name: p.name, price: p.price, qty: l.qty } : null; }).filter(Boolean);
const thumb = (p, size) => `<div class="cthumb" style="width:${size}px;height:${size}px;${p && p.img ? `background-image:url(${p.img})` : `background:${catColor(p ? p.cat : "")}`}">${p && p.img ? "" : esc(initials(p ? p.name : "?"))}</div>`;
const custPlaceholder = t => t === "Dine in" ? "Table no. or customer name" : t === "Take out" ? "Customer name" : "Name, number and address";
const cartTotals = () => computeTotals(cartItems(), discount);
function renderSell(st) {
  if (activeCat && !P.categories.includes(activeCat)) activeCat = null;
  const q = query.trim().toLowerCase();
  const prods = P.products.filter(p => (!activeCat || p.cat === activeCat) && (!q || p.name.toLowerCase().includes(q)));
  const count = cart.reduce((a, b) => a + b.qty, 0), t = cartTotals();
  return `<div class="sell"><section aria-label="Products">
      <label class="search">${icon("search")}<input id="q" data-act-input="q" placeholder="Search the menu" value="${esc(query)}" autocomplete="off"></label>
      <div class="cats" role="group" aria-label="Categories"><button data-act="cat" data-v="" aria-pressed="${!activeCat}">All</button>${P.categories.map(c => `<button data-act="cat" data-v="${esc(c)}" aria-pressed="${activeCat === c}">${esc(c)}</button>`).join("")}</div>
      <div class="prods">${prods.map(p => { const qn = (cart.find(l => l.id === p.id) || {}).qty; return `<button class="prod ${p.on ? "" : "off"}" data-act="add" data-v="${p.id}" ${p.on ? "" : "disabled"}>
          <div class="pic" style="${p.img ? `background-image:url(${p.img})` : `background:${catColor(p.cat)}`}">${p.img ? "" : esc(initials(p.name))}</div>
          <div class="top"><span class="pn">${esc(p.name)}</span><span class="pp">${peso0(p.price)}</span></div>
          ${p.desc ? `<div class="pd">${esc(p.desc)}</div>` : ""}
          <div class="add">${p.on ? "Add to order" : "Sold out"}</div>${qn ? `<span class="qbadge">${qn}</span>` : ""}</button>`; }).join("") || `<div class="empty">${q ? "No items match your search." : `No items yet. ${P.role === "owner" ? "Add some in Menu." : ""}`}</div>`}</div>
    </section>
    <aside class="cartpanel card">${cartHTML(st)}</aside>
    <div class="cartbar">${count ? `<button class="btn primary lg block" data-act="opencart"><span>View order · ${count} item${count > 1 ? "s" : ""}</span><span class="num" style="margin-left:auto">${peso(t.total)}</span></button>` : ""}</div>
  </div>`;
}
function cartHTML(st) {
  const t = cartTotals();
  const lines = cart.map(l => { const p = P.products.find(x => x.id === l.id); if (!p) return ""; return `<div class="line">${thumb(p, 44)}<div class="ln">${esc(p.name)}<div class="muted small num">${peso0(p.price)} each</div></div>
    <div class="qty"><button data-act="dec" data-v="${l.id}" aria-label="One less">−</button><span>${l.qty}</span><button data-act="inc" data-v="${l.id}" aria-label="One more">+</button></div>
    <div class="num" style="font-weight:800;min-width:72px;text-align:right">${peso(p.price * l.qty)}</div></div>`; }).join("");
  return `<div class="row" style="justify-content:space-between"><h2>Current order ${hb("order")}</h2>${cart.length ? `<button class="btn" style="min-height:36px;padding:6px 12px;font-size:13px" data-act="clearcart">Clear</button>` : ""}</div>
    <div class="otype" role="group" aria-label="Order type" style="margin-top:12px">${[["Dine in", "dine"], ["Take out", "take"], ["Delivery", "deliv"]].map(([l, i]) => `<button data-act="otype" data-v="${l}" aria-pressed="${P.orderType === l}">${icon(i)}${l}</button>`).join("")}</div>
    <label class="f" for="cust" style="margin-top:10px"><span>${P.orderType === "Dine in" ? "Table / name" : P.orderType === "Take out" ? "Customer" : "Deliver to"} <span style="font-weight:600">(optional)</span></span><input class="inp" id="cust" data-act-input="cust" value="${esc(custName)}" placeholder="${custPlaceholder(P.orderType)}" autocomplete="off"></label>
    ${cart.length ? `<div class="lines">${lines}</div>
    <div class="row" style="gap:8px;margin:4px 0 8px"><span class="small muted" style="font-weight:700">Discount</span><div class="opts"><button data-act="disc" data-v="none" aria-pressed="${discount === "none"}">None</button><button data-act="disc" data-v="scpwd" aria-pressed="${discount === "scpwd"}">Senior / PWD 20%</button></div></div>
    <div class="sum"><span>Subtotal</span><span>${peso(t.sub)}</span></div>
    ${t.lessVat ? `<div class="sum"><span>Less VAT 12%</span><span>−${peso(t.lessVat)}</span></div>` : ""}
    ${t.disc ? `<div class="sum"><span>Senior/PWD discount</span><span>−${peso(t.disc)}</span></div>` : ""}
    <div class="sum total"><span>Total</span><span>${peso(t.total)}</span></div>
    <button class="btn primary lg block" style="margin-top:12px" data-act="checkout" ${canSell(st) ? "" : "disabled"}>${canSell(st) ? "Charge " + peso(t.total) : "Selling paused"}</button>`
    : `<div class="empty">Tap items to start an order.</div>`}`;
}
function payHTML() {
  const t = cartTotals(), tend = +pay.tendered || 0;
  const quick = [...new Set([t.total, Math.ceil(t.total / 50) * 50, Math.ceil(t.total / 100) * 100, 500, 1000].filter(v => v >= t.total))].slice(0, 5);
  const sumLines = cart.map(l => { const p = P.products.find(x => x.id === l.id); return p ? `<div class="pline">${thumb(p, 52)}<div style="flex:1;min-width:0"><div style="font-weight:700">${esc(p.name)}</div><div class="small muted num">${l.qty} × ${peso0(p.price)}</div></div><div class="num" style="font-weight:800">${peso(p.price * l.qty)}</div></div>` : ""; }).join("");
  return `<div class="mhead"><h2>Payment · ${peso(t.total)}</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div><div class="stack">
    <div class="psum"><div class="row small" style="justify-content:space-between;font-weight:700"><span>${esc(P.orderType)}${custName.trim() ? " · " + esc(custName.trim()) : ""}</span><span class="muted">${cart.reduce((a, b) => a + b.qty, 0)} items</span></div>${sumLines}</div>
    <div class="methods" role="group" aria-label="Payment method">${["Cash", "GCash", "Maya"].map(m => `<button data-act="method" data-v="${m}" aria-pressed="${pay.method === m}">${m}</button>`).join("")}</div>
    ${pay.method === "Cash" ? `<label class="f" for="tend">Cash received<input class="inp num" id="tend" inputmode="decimal" value="${esc(pay.tendered)}" data-act-input="tend" placeholder="0.00"></label>
      <div class="quick">${quick.map(v => `<button data-act="tendq" data-v="${v}">${v === t.total ? "Exact" : peso0(v)}</button>`).join("")}</div>
      <div class="row" style="justify-content:space-between"><span class="muted" style="font-weight:700">Change</span><span class="change" id="chg">${tend >= t.total ? peso(tend - t.total) : "—"}</span></div>`
    : `<label class="f" for="pref">${pay.method} reference no. (optional)<input class="inp num" id="pref" inputmode="numeric" value="${esc(pay.ref)}" data-act-input="pref"></label><p class="small muted" style="margin:0">Check the payment arrived in your ${pay.method} app before you complete the sale.</p>`}
    ${discount === "scpwd" ? `<label class="f" for="scid">Senior / PWD ID no.<input class="inp" id="scid" value="${esc(pay.scId)}" data-act-input="scid" placeholder="Required for the discount"></label>` : ""}
    <button class="btn primary lg block" id="confirmPay" data-act="confirmpay" ${pay.method === "Cash" && tend < t.total ? "disabled" : ""}>Complete sale</button></div>`;
}
function receiptText(s) { return ascii(`${P.brand.name}\nReceipt #${s.no} · ${fmtDT(s.ts)}${s.orderType ? " · " + s.orderType : ""}${s.customer ? " · " + s.customer : ""}\n${s.items.map(i => `${i.qty} x ${i.name}  ${(i.price * i.qty).toFixed(2)}`).join("\n")}\nTOTAL PHP ${s.total.toFixed(2)} (${s.method})\nVerify: ${s.code}`); }
function receiptHTML(s, big) {
  const b = P.brand;
  const qrText = `OWNPOS RECEIPT\n${b.name}\nNo. ${s.no}\n${new Date(s.ts).toISOString().slice(0, 16).replace("T", " ")}\nTotal PHP ${s.total.toFixed(2)}\nVerify ${s.code}`;
  return `<div class="paper" style="--paper-brand:${b.color}">
    <div class="rh">${b.receiptLogo && b.logo ? `<img src="${b.logo}" alt="">` : ""}<div class="rn">${esc(b.name)}</div>${b.address ? `<div>${esc(b.address)}</div>` : ""}${b.tin ? `<div>TIN ${esc(b.tin)}</div>` : ""}</div>
    <hr><div class="r"><span>Receipt</span><span>#${s.no}</span></div><div class="r"><span>${fmtDT(s.ts)}</span><span>${esc(s.cashier)}</span></div>${s.orderType ? `<div class="r"><span>${esc(s.orderType)}</span><span>${esc(s.customer || "")}</span></div>` : ""}<hr>
    ${s.items.map(i => `<div class="r"><span>${i.qty} × ${esc(i.name)}</span><span>${(i.price * i.qty).toFixed(2)}</span></div>`).join("")}
    <hr><div class="r"><span>Subtotal</span><span>${s.sub.toFixed(2)}</span></div>
    ${s.lessVat ? `<div class="r"><span>Less VAT 12%</span><span>-${s.lessVat.toFixed(2)}</span></div>` : ""}${s.disc ? `<div class="r"><span>Less SC/PWD 20%</span><span>-${s.disc.toFixed(2)}</span></div>` : ""}
    <div class="r b"><span>TOTAL</span><span>₱${s.total.toFixed(2)}</span></div>
    <div class="r"><span>${esc(s.method)}${s.ref ? " · " + esc(s.ref) : ""}</span><span>${s.tendered.toFixed(2)}</span></div>
    ${s.method === "Cash" ? `<div class="r"><span>Change</span><span>${s.change.toFixed(2)}</span></div>` : ""}
    ${s.vat ? `<hr><div class="r"><span>VATable sales</span><span>${s.vatable.toFixed(2)}</span></div><div class="r"><span>VAT 12%</span><span>${s.vat.toFixed(2)}</span></div>` : ""}
    ${s.scId ? `<div class="r"><span>SC/PWD ID</span><span>${esc(s.scId)}</span></div>` : ""}
    <div class="qr">${qr(qrText, big ? 180 : 128)}<div>Verification code</div><div class="vcode">${s.code}</div></div>
    ${b.footer ? `<div class="foot">${esc(b.footer)}</div>` : ""}
    <div class="disclaim">Digital receipt · Not an official BIR invoice</div></div>`;
}
function openReceipt(no, fresh) {
  const s = P.sales.find(x => x.no === no); if (!s) return;
  openModal(`<div class="mhead"><h2>${fresh ? "Sale complete" : "Receipt #" + s.no}</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div><div class="stack">
    ${fresh && s.method === "Cash" ? `<div class="banner info" style="justify-content:space-between"><span>Change due</span><span class="change">${peso(s.change)}</span></div>` : ""}
    <p class="small muted" style="margin:0;text-align:center">Turn the screen to the customer. They can take a photo or scan the QR code.</p>
    ${receiptHTML(s)}
    <div class="row"><button class="btn primary" style="flex:1" data-act="showcust" data-v="${s.no}">Show to customer</button><button class="btn" data-act="sharereceipt" data-v="${s.no}">Send</button>${fresh ? `<button class="btn" data-act="closemodal">New sale</button>` : ""}</div></div>`);
}

/* ---------- sales ---------- */
function renderSales(st) {
  const todays = P.sales.filter(s => dayNum(s.ts) === st.today), total = todays.reduce((a, b) => a + b.total, 0);
  const counts = {}; todays.forEach(s => s.items.forEach(i => counts[i.name] = (counts[i.name] || 0) + i.qty));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const byM = m => todays.filter(s => s.method === m).reduce((a, b) => a + b.total, 0);
  const list = P.sales.slice().reverse().slice(0, 100);
  return `<div class="tiles"><div class="tile"><div class="k">Sales today</div><div class="v">${peso0(total)}</div></div><div class="tile"><div class="k">Transactions</div><div class="v">${todays.length}</div></div><div class="tile"><div class="k">Average sale</div><div class="v">${peso0(todays.length ? total / todays.length : 0)}</div></div><div class="tile"><div class="k">Best seller</div><div class="v" style="font-size:17px;padding-top:6px">${top ? esc(top[0]) + ` <span class="muted small">×${top[1]}</span>` : "—"}</div></div></div>
    <div class="grid2" style="grid-template-columns:2fr 1fr">
      <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h2>Receipts ${hb("receipts")}</h2>${P.role === "owner" ? `<button class="btn" style="min-height:36px;padding:6px 12px;font-size:13px" data-act="csv">Export CSV</button>` : ""}</div>
        <div class="tablewrap"><table class="t"><thead><tr><th>No.</th><th>Time</th><th>Customer</th><th>Paid by</th><th style="text-align:right">Total</th></tr></thead><tbody>
        ${list.map(s => `<tr data-act="receipt" data-v="${s.no}"><td class="num">#${s.no}</td><td class="num">${fmtDT(s.ts)}</td><td>${esc([s.orderType, s.customer].filter(Boolean).join(" · "))}</td><td>${esc(s.method)}</td><td class="num" style="text-align:right;font-weight:800">${peso(s.total)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No sales yet.</td></tr>`}</tbody></table></div></div>
      <div class="stack"><div class="card stack"><h2>Today by payment ${hb("bymethod")}</h2>${["Cash", "GCash", "Maya"].map(m => `<div class="sum"><span>${m}</span><span>${peso(byM(m))}</span></div>`).join("")}</div>
        <div class="card stack"><h2>Check a receipt photo ${hb("verify")}</h2><p class="small muted" style="margin:0">Type the receipt number and verification code from a customer’s photo to confirm it’s real.</p>
          <label class="f" for="vno">Receipt no.<input class="inp num" id="vno" inputmode="numeric" placeholder="000003"></label><label class="f" for="vcode">Verification code<input class="inp num" id="vcode" placeholder="7F3A-91C2"></label>
          <button class="btn" data-act="verify">Check receipt</button><div id="vres"></div></div></div></div>`;
}

/* ---------- menu ---------- */
function renderMenu() {
  return `<div class="grid2" style="grid-template-columns:2fr 1fr">
    <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h2>Items ${hb("items")} <span class="muted small">(${P.products.length})</span></h2><button class="btn primary" data-act="editprod" data-v="">Add item</button></div>
      ${P.categories.map(c => { const items = P.products.filter(p => p.cat === c); return `<h3 class="muted" style="margin:16px 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:.05em">${esc(c)}</h3>` + (items.map(p => `<div class="mrow"><div class="thumb" style="${p.img ? `background-image:url(${p.img})` : `background:${catColor(p.cat)}`}">${p.img ? "" : esc(initials(p.name))}</div><div><div style="font-weight:700">${esc(p.name)}</div><div class="small muted num">${peso(p.price)}</div></div><label class="switch" title="Available"><input type="checkbox" data-act-change="toggleon" data-v="${p.id}" ${p.on ? "checked" : ""} aria-label="${esc(p.name)} available"><span></span></label><button class="btn" style="min-height:38px;padding:6px 12px;font-size:13px" data-act="editprod" data-v="${p.id}">Edit</button></div>`).join("") || `<div class="small muted" style="padding:6px 0">No items yet.</div>`); }).join("")}</div>
    <div class="stack"><div class="card stack"><h2>Categories ${hb("categories")}</h2>
      ${P.categories.map((c, i) => `<div class="row" style="justify-content:space-between"><span style="font-weight:700">${esc(c)}</span><span class="row" style="gap:4px"><button class="btn" style="min-height:36px;padding:4px 10px" data-act="catup" data-v="${i}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button><button class="btn danger" style="min-height:36px;padding:4px 10px;font-size:13px" data-act="catdel" data-v="${i}">Remove</button></span></div>`).join("")}
      <div class="row"><input class="inp" id="newcat" placeholder="New category" style="flex:1;min-width:120px"><button class="btn" data-act="catadd">Add</button></div></div></div></div>`;
}
function prodModal(id) {
  const p = id ? P.products.find(x => x.id === id) : { id: "", name: "", price: "", cat: P.categories[0] || "", desc: "", img: "", on: true };
  openModal(`<div class="mhead"><h2>${id ? "Edit item" : "Add item"}</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div>
    <form class="stack" id="prodForm" data-id="${p.id}">
      <label class="f" for="pname">Name<input class="inp" id="pname" required value="${esc(p.name)}"></label>
      <div class="row" style="align-items:flex-end"><label class="f" for="pprice" style="flex:1">Price (₱)<input class="inp num" id="pprice" inputmode="decimal" required value="${esc(p.price)}"></label>
      <label class="f" for="pcat" style="flex:1">Category<select class="inp" id="pcat">${P.categories.map(c => `<option ${c === p.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label></div>
      <label class="f" for="pdesc">Short description (optional)<input class="inp" id="pdesc" value="${esc(p.desc || "")}" maxlength="80"></label>
      <div class="logoup"><div class="lp" id="pimgPrev">${p.img ? `<img src="${p.img}" alt="">` : "Photo"}</div><span class="btn filebtn">Choose photo<input type="file" accept="image/*" data-act-change="pimg"></span>${p.img ? `<button type="button" class="btn danger" data-act="pimgclear">Remove</button>` : ""}<input type="hidden" id="pimgData" value="${esc(p.img)}"></div>
      <label class="row" style="font-weight:700"><input type="checkbox" id="pon" ${p.on ? "checked" : ""}> Available to sell</label>
      <div class="row"><button class="btn primary" type="submit" style="flex:1">Save item</button>${id ? `<button type="button" class="btn danger" data-act="delprod" data-v="${id}">Delete</button>` : ""}</div></form>`);
}

/* ---------- brand ---------- */
function renderBrand() {
  const b = P.brand;
  const sample = P.sales[P.sales.length - 1] || { no: "000001", ts: Date.now(), items: [{ name: "Sample item", price: 100, qty: 1 }], sub: 100, total: 100, lessVat: 0, disc: 0, vat: 0, vatable: 0, method: "Cash", tendered: 100, change: 0, ref: "", cashier: "Owner", code: "ABCD-1234", scId: "", orderType: "Dine in" };
  return `<div class="grid2" style="grid-template-columns:3fr 2fr"><div class="stack">
      <div class="card stack"><h2>Quick themes ${hb("themes")}</h2><div class="presets">${PRESETS.map(p => `<button class="preset" data-act="preset" data-v="${p.id}"><div class="pv" style="background:${p.color};color:${inkFor(p.color)};font-family:'${p.font}'">${esc((b.name.split(" ")[0]) || "Store")}</div><div class="pl">${p.label}</div></button>`).join("")}</div></div>
      <div class="card stack"><h2>Store details ${hb("storedetails")}</h2>
        <div class="logoup"><div class="lp">${b.logo ? `<img src="${b.logo}" alt="Logo">` : esc(initials(b.name))}</div><span class="btn filebtn">Upload logo<input type="file" accept="image/*" data-act-change="logo"></span>${b.logo ? `<button class="btn danger" data-act="logoclear">Remove</button>` : ""}</div>
        <label class="f" for="bname">Store name<input class="inp" id="bname" data-brand="name" value="${esc(b.name)}"></label>
        <label class="f" for="btag">Tagline<input class="inp" id="btag" data-brand="tagline" value="${esc(b.tagline)}"></label>
        <label class="f" for="baddr">Address (on receipts)<input class="inp" id="baddr" data-brand="address" value="${esc(b.address)}"></label>
        <label class="f" for="btin">TIN (optional)<input class="inp num" id="btin" data-brand="tin" value="${esc(b.tin)}"></label></div>
      <div class="card stack"><h2>Look and feel ${hb("look")}</h2>
        <div class="f">Brand colour<div class="swatches">${SWATCHES.map(c => `<button data-act="color" data-v="${c}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="${b.color.toLowerCase() === c.toLowerCase()}"></button>`).join("")}<input type="color" data-brand="color" value="${b.color}" aria-label="Custom colour" style="width:44px;height:38px;border:0;background:none;padding:0"></div></div>
        <div class="f">Font<div class="opts">${FONTS.map(f => `<button data-act="font" data-v="${f}" aria-pressed="${b.font === f}" style="font-family:'${f}'">${f}</button>`).join("")}</div></div>
        <div class="f">Corners<div class="opts">${[["round", "Round"], ["soft", "Soft"], ["square", "Square"]].map(([k, l]) => `<button data-act="corners" data-v="${k}" aria-pressed="${b.corners === k}">${l}</button>`).join("")}</div></div>
        <div class="f">Item buttons<div class="opts">${[["comfortable", "Large"], ["compact", "Compact"]].map(([k, l]) => `<button data-act="tilesz" data-v="${k}" aria-pressed="${b.tile === k}">${l}</button>`).join("")}<button data-act="photos" aria-pressed="${b.photos}">${b.photos ? "Photos on" : "Photos off"}</button></div></div></div>
      <div class="card stack"><h2>Receipt ${hb("receiptset")}</h2>
        <label class="f" for="bfoot">Message at the bottom<input class="inp" id="bfoot" data-brand="footer" value="${esc(b.footer)}"></label>
        <label class="row" style="font-weight:700"><input type="checkbox" data-brand-check="receiptLogo" ${b.receiptLogo ? "checked" : ""}> Show logo on receipt</label>
        <label class="row" style="font-weight:700"><input type="checkbox" data-brand-check="vat" ${b.vat ? "checked" : ""}> VAT-registered (prices include 12% VAT)</label></div>
    </div>
    <div class="stack"><div class="card stack"><h2>Receipt preview ${hb("rpreview")}</h2><div id="rprev">${receiptHTML(sample)}</div></div></div></div>`;
}

/* ---------- subscription ---------- */
let selPlan = "Monthly";
function renderSub(st) {
  const total = Math.max(1, st.exp - st.start), used = Math.min(total, Math.max(0, st.today - st.start));
  const chip = { active: `<span class="chip good">Active</span>`, expiring: `<span class="chip warn">Ending soon</span>`, grace: `<span class="chip bad">Grace period</span>`, limited: `<span class="chip bad">Selling paused</span>` }[st.key];
  const big = st.key === "grace" ? [st.graceLeft, "days left to renew"] : st.key === "limited" ? [Math.abs(st.d), "days since it ended"] : [st.d, st.d === 1 ? "day left" : "days left"];
  const ev = [[st.exp - 7, "Reminder: 7 days left"], [st.exp - 3, "Reminder: 3 days left"], [st.exp - 1, "Reminder: ends tomorrow"], [st.exp, (st.plan === "Trial" ? "Trial" : "Plan") + " ends"], [st.exp + 1, "7-day grace period starts"], [st.exp + 8, "Selling pauses · records stay viewable"]].filter(e => e[0] >= st.start);
  const plan = PLANS.find(p => p.id === selPlan);
  const payLine = CFG.gcashNumber ? `Send <b>${peso0(plan.price)}</b> by GCash to <b>${esc(CFG.gcashName || "OwnPOS")}</b> · <b class="num">${esc(CFG.gcashNumber)}</b>.` : `Message OwnPOS for payment details at <b>${esc(CFG.email)}</b>.`;
  return `<div class="grid2"><div class="stack">
      <div class="card stack"><div class="row" style="justify-content:space-between"><h2>${st.plan === "Trial" ? "30-day free trial" : esc(st.plan) + " plan"} ${hb("plan")}</h2>${chip}</div>
        <div class="bigstat"><span class="d">${big[0]}</span><span class="muted" style="font-weight:700">${big[1]}</span></div>
        <div class="bar"><i style="width:${(used / total) * 100}%"></i></div>
        <dl class="kv"><dt>Started</dt><dd>${fmtDayLong(st.start)}</dd><dt>Ends</dt><dd>${fmtDayLong(st.exp)}</dd><dt>Selling pauses</dt><dd>${fmtDayLong(st.exp + 8)}</dd><dt>Device ID</dt><dd class="num">${P.deviceId}</dd></dl></div>
      <div class="card stack"><h2>What happens next ${hb("timeline")}</h2><p class="small muted" style="margin:0">Worked out on this device. No internet needed.</p>
        <ul class="tl">${ev.map(e => `<li class="${e[0] <= st.today ? "done" : ""}"><span class="dt">${fmtDay(e[0])}</span><span class="dot"></span><span class="tx">${e[1]}</span></li>`).join("")}</ul></div>
    </div><div class="stack">
      <div class="card stack"><h2>Renew OwnPOS ${hb("renew")}</h2>
        <div class="plans" role="group" aria-label="Plan">${PLANS.map(p => `<button class="plan" data-act="plan" data-v="${p.id}" aria-pressed="${selPlan === p.id}"><span><b>${p.label}</b>${p.save ? `<br><span class="small" style="color:var(--good);font-weight:700">${p.save}</span>` : ""}</span><b class="num">${peso0(p.price)}</b></button>`).join("")}</div>
        <ol class="steps"><li>${payLine}</li>${CFG.server ? `<li>Enter the reference number and tap <b>Send renewal request</b>.</li><li>Once OwnPOS confirms your payment, your new end date arrives on this device by itself.</li>` : `<li>Enter the reference number, then tap <b>Send renewal request</b>. Choose Messenger, SMS or email.</li><li>When OwnPOS sends back your license, tap <b>Scan license</b> and point the camera at the QR code, or paste the code.</li>`}</ol>
        <label class="f" for="rref">Payment reference no.<input class="inp num" id="rref" inputmode="numeric" placeholder="e.g. 1029 384 756"></label>
        <button class="btn own lg" data-act="sendrequest">Send renewal request</button>${CFG.server && online ? `<button class="btn" style="border:0;color:var(--muted);font-weight:600" data-act="sharerequest">Or send it by Messenger or SMS</button>` : ""}
        ${P.lastRequest && Date.now() - P.lastRequest.at < 7 * DAY ? `<div class="result good">Request sent ${fmtDT(P.lastRequest.at)} · GCash ref ${esc(P.lastRequest.ref)}. Your new end date arrives on this device by itself once OwnPOS confirms your payment, usually within the day. Keep OwnPOS connected to the internet.</div>` : ""}</div>
      <div class="card stack"><h2>Activate a license ${hb("activate")}</h2>
        <button class="btn primary lg" data-act="scanlicense">Scan license QR</button>
        <label class="f" for="licIn">Or paste the message or code OwnPOS sent you<textarea class="inp mono" id="licIn" placeholder="OWNPOS1.…"></textarea></label>
        <button class="btn" data-act="activate">Activate code</button>${subMsg ? `<div class="result ${subMsg[0]}">${subMsg[1]}</div>` : ""}</div>
    </div></div>`;
}
function requestText() {
  const st = status(), plan = PLANS.find(p => p.id === selPlan), ref = ($("#rref") && $("#rref").value.trim()) || "(not entered)";
  return `OwnPOS renewal request\nStore: ${P.brand.name}\nOwner: ${P.owner.name} · ${P.owner.mobile}\nDevice: ${P.deviceId}\nPlan: ${plan.id} (${peso0(plan.price)})\nCurrent end date: ${iso(st.exp)}\nPayment reference: ${ref}`;
}
async function activate(token) {
  token = String(token || "").trim();
  const m = token.match(/OWNPOS1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/); if (m) token = m[0]; // accepts the whole message too
  const pl = await verifyLicense(token);
  if (!pl) { subMsg = ["bad", "That license code isn’t valid. It may be incomplete or edited. Ask OwnPOS to send it again."]; render(); return; }
  if (pl.dev !== P.deviceId) { subMsg = ["bad", `This license is for another device (${esc(pl.dev)}). This device is ${P.deviceId}.`]; render(); return; }
  const cur = LIC ? fromIso(LIC.exp) : P.trial.exp;
  if (fromIso(pl.exp) < cur) { subMsg = ["bad", "This license ends earlier than the one you already have."]; render(); return; }
  P.license = token; P.lastRequest = null; await refreshLicense(); save(true); checkin();
  subMsg = ["good", `License activated. OwnPOS is active until ${fmtDayLong(fromIso(pl.exp))}.`]; render();
}

/* ---------- settings: updates, feedback, backup ---------- */
let update = null; // {version, notes, url, page}
function renderSettings() {
  const upd = update;
  return `<div class="grid2"><div class="stack">
      <div class="card stack"><div class="row" style="justify-content:space-between"><h2>Updates ${hb("updates")}</h2>${upd ? `<span class="chip warn">Update ready</span>` : online ? `<span class="chip good">Up to date</span>` : `<span class="chip info">Offline</span>`}</div>
        <dl class="kv"><dt>This device</dt><dd>OwnPOS ${esc(CFG.version)}</dd><dt>Latest</dt><dd>${upd ? "OwnPOS " + esc(upd.version) : online ? "OwnPOS " + esc(CFG.version) : "Unknown while offline"}</dd><dt>Last checked</dt><dd>${P.lastCheck ? fmtDT(P.lastCheck) : "Not yet"}</dd></dl>
        <p class="small muted" style="margin:0">OwnPOS checks when it opens, every 6 hours, and when the internet comes back. Your sales and menu are kept when you update.</p>
        ${upd ? `<button class="btn primary" data-act="openupdate">See what’s new in ${esc(upd.version)}</button>` : `<button class="btn" data-act="checkupdate">Check for updates</button>`}<div id="chkres"></div></div>
      <div class="card stack"><h2>Back up your data ${hb("backup")}</h2>
        <p class="small muted" style="margin:0">Your sales, menu and brand are saved only on this device. Save a backup file to Google Drive, email or a USB drive at least once a week.</p>
        <div class="row"><button class="btn primary" data-act="backup">Save a backup</button><span class="btn filebtn">Restore from backup<input type="file" accept="application/json,.json" data-act-change="restore"></span></div></div>
    </div><div class="stack">
      <div class="card stack"><h2>Feedback ${hb("feedback")}</h2><p class="small muted" style="margin:0">Ideas, problems and praise go straight to the OwnPOS team.</p>
        <button class="btn primary" data-act="openfeedback">Send feedback</button>
        ${P.outbox.length ? `<div class="result warn">${P.outbox.length} feedback waiting. It sends automatically when you’re back online.</div>` : ""}</div>
      <div class="card stack"><h2>About this device ${hb("about")}</h2><dl class="kv"><dt>Store</dt><dd>${esc(P.brand.name)}</dd><dt>Owner</dt><dd>${esc(P.owner.name)} · ${esc(P.owner.mobile)}</dd><dt>Device ID</dt><dd class="num">${P.deviceId}</dd><dt>App</dt><dd>OwnPOS ${esc(CFG.version)}</dd><dt>Sales saved</dt><dd>${P.sales.length}</dd></dl></div>
    </div></div>`;
}
async function checkUpdates(manual) {
  if (!online || !CFG.repo) { if (manual && $("#chkres")) $("#chkres").innerHTML = `<div class="result bad">No internet. OwnPOS will check again when you’re back online.</div>`; return; }
  try {
    const r = await fetch(`https://api.github.com/repos/${CFG.repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(); const v = String(j.tag_name || "").replace(/^v/, "");
    const apk = (j.assets || []).find(a => /\.apk$/i.test(a.name));
    P.lastCheck = Date.now(); save();
    update = v && vcmp(v, CFG.version) > 0 && apk ? { version: v, url: apk.browser_download_url, page: j.html_url, notes: String(j.body || "").split(/\r?\n/).map(l => l.replace(/^[-*]\s*/, "").trim()).filter(l => l && !/^#/.test(l)).slice(0, 8) } : null;
    render();
    if (manual && $("#chkres")) $("#chkres").innerHTML = update ? "" : `<div class="result good">You have the latest version, OwnPOS ${esc(CFG.version)}.</div>`;
    if (update && P.updatePrompted !== update.version && !cart.length && !modalOpen()) { P.updatePrompted = update.version; save(); A.openupdate(); }
  } catch (e) { if (manual && $("#chkres")) $("#chkres").innerHTML = `<div class="result bad">Couldn’t check right now. Try again in a while.</div>`; }
}
const vparts = v => String(v).split(".").map(n => parseInt(n, 10) || 0);
const vcmp = (a, b) => { const x = vparts(a), y = vparts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
/* in-app update: download with progress, then Android's installer */
let U = { phase: "ready" };          // ready | downloading | permission | installing | error
const mb = n => (n / 1048576).toFixed(1);
function updateHTML(u) {
  const head = `<div class="mhead"><h2>${U.phase === "installing" ? "Almost done" : `OwnPOS ${esc(u.version)} is ready`}</h2>${U.phase === "downloading" ? "" : `<button class="x" data-act="closemodal" aria-label="Close">×</button>`}</div>`;
  const icon = `<div class="updicon"><svg viewBox="0 0 64 64" width="56" height="56"><rect width="64" height="64" rx="16" fill="#2343D9"/><path d="M20 14H44V46L40 43L36 46L32 43L28 46L24 43L20 46Z" fill="#fff"/><rect x="25" y="21" width="14" height="3" rx="1.5" fill="#2343D9"/><rect x="25" y="28" width="10" height="3" rx="1.5" fill="#2343D9"/><circle cx="45" cy="45" r="9" fill="#FFB627"/><path d="M41 45L44 48L49 42" stroke="#14171C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><div><b>OwnPOS ${esc(u.version)}</b><div class="small muted">You have ${esc(CFG.version)}</div></div></div>`;
  if (U.phase === "downloading") return head + `<div class="stack">${icon}
      <div class="updbar"><i id="updfill" style="width:${Math.max(2, U.pct || 0)}%"></i></div>
      <div class="row small" style="justify-content:space-between;font-weight:700"><span id="updpct">${U.pct >= 0 ? U.pct + "%" : "Downloading…"}</span><span class="muted num" id="updmb">${U.total > 0 ? `${mb(U.done || 0)} of ${mb(U.total)} MB` : ""}</span></div>
      <p class="small muted" style="margin:0">Downloading the update. You can keep this screen open. It takes about a minute on mobile data.</p>
      <button class="btn" data-act="cancelupdate">Cancel</button></div>`;
  if (U.phase === "permission") return head + `<div class="stack">${icon}
      <div class="result warn">One-time step: allow OwnPOS to install its updates.</div>
      <ol class="steps small"><li>Tap <b>Open setting</b>.</li><li>Turn on <b>Allow from this source</b>.</li><li>Press back. The update continues by itself.</li></ol>
      <button class="btn primary lg block" data-act="installsettings">Open setting</button></div>`;
  if (U.phase === "installing") return head + `<div class="stack">${icon}
      <p style="margin:0">Android will ask <b>“Do you want to update this app?”</b>. Tap <b>Update</b>.</p>
      <p class="small muted" style="margin:0">When it says the app is installed, tap <b>Open</b>. Your sales, menu and license are kept.</p>
      <button class="btn" data-act="installnow">Show the installer again</button></div>`;
  return head + `<div class="stack">${icon}
    ${U.phase === "error" ? `<div class="result bad">${esc(U.err || "The update didn’t download.")} Check the internet and try again.</div>` : ""}
    ${u.notes.length ? `<div class="small" style="font-weight:700">What’s new</div><ul class="notes">${u.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    ${cart.length ? `<div class="result warn">Finish the current order first. Updates never interrupt a sale.</div>` : ""}
    <div class="row"><button class="btn primary lg" style="flex:1" data-act="downloadupdate" ${cart.length ? "disabled" : ""}>${U.phase === "error" ? "Try again" : "Update now"}</button><button class="btn lg" data-act="closemodal">Later</button></div>
    ${U.phase === "error" ? `<button class="btn" style="border:0;color:var(--muted);font-weight:600" data-act="browserupdate">Download in the browser instead</button>` : ""}</div>`;
}
function drawUpdate() { if (update) { $("#mbox").className = "box"; $("#mbox").innerHTML = updateHTML(update); $("#modal").classList.remove("hidden"); } }
let progressHandle = null;
async function startUpdate() {
  const au = plug("ApkUpdater");
  if (!isNative || !au) { await openUrl(update.url); closeModal(); return; }   // older builds / browser
  U = { phase: "downloading", pct: 0, done: 0, total: 0 }; drawUpdate();
  try {
    if (!progressHandle) progressHandle = await au.addListener("progress", ev => {
      U.pct = ev.percent; U.done = ev.done; U.total = ev.total;
      const f = $("#updfill"), p = $("#updpct"), m = $("#updmb");
      if (f) f.style.width = Math.max(2, ev.percent || 0) + "%"; if (p) p.textContent = ev.percent >= 0 ? ev.percent + "%" : "Downloading…"; if (m && ev.total > 0) m.textContent = `${mb(ev.done)} of ${mb(ev.total)} MB`;
    });
    const r = await au.download({ url: update.url, fileName: `OwnPOS-${update.version}.apk` });
    U.path = r.path; save(true);
    await installUpdate();
  } catch (e) {
    const msg = String((e && e.message) || e);
    U = /cancel/i.test(msg) ? { phase: "ready" } : { phase: "error", err: msg };
    if (modalOpen()) drawUpdate();
  }
}
async function installUpdate() {
  const au = plug("ApkUpdater"); if (!au || !U.path) return;
  const { allowed } = await au.canInstall();
  if (!allowed) { U.phase = "permission"; drawUpdate(); return; }
  U.phase = "installing"; drawUpdate();
  try { await au.install({ path: U.path }); } catch (e) { U = { phase: "error", err: String((e && e.message) || e) }; drawUpdate(); }
}
let fb = null;
const metaLine = () => `OwnPOS ${CFG.version} · ${P.deviceId} · ${deviceInfo}`;
let deviceInfo = "Android";
function feedbackHTML() {
  return `<div class="mhead"><h2>Send feedback</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div><div class="stack">
    <div class="typechips" role="group" aria-label="Type">${["Idea", "Problem", "Praise", "Other"].map(t => `<button data-act="fbtype" data-v="${t}" aria-pressed="${fb.type === t}">${t}</button>`).join("")}</div>
    <label class="f" for="fbmsg">Your message<textarea class="inp" id="fbmsg" data-act-input="fbmsg" placeholder="${fb.type === "Problem" ? "What happened, and what did you expect?" : fb.type === "Idea" ? "What would make OwnPOS better for your store?" : "Tell us anything"}">${esc(fb.msg)}</textarea></label>
    <label class="f" for="fbemail">Your email (optional, for a reply)<input class="inp" id="fbemail" type="email" data-act-input="fbemail" value="${esc(fb.email)}" placeholder="you@gmail.com"></label>
    <label class="row" style="font-weight:700;font-size:14px"><input type="checkbox" data-act-change="fbmeta" ${fb.meta ? "checked" : ""}> Include app version and device info</label>
    ${fb.meta ? `<p class="small muted" style="margin:-6px 0 0 26px">${esc(metaLine())}</p>` : ""}
    ${online ? "" : `<div class="result warn">You’re offline. Your feedback will be saved and sent when the internet comes back.</div>`}
    <button class="btn primary lg block" data-act="sendfeedback">${online ? "Send feedback" : "Save and send later"}</button>
    <button class="btn" style="border:0;color:var(--muted);font-weight:600" data-act="emailfeedback">Or write an email instead</button></div>`;
}
async function postFeedback(item) {
  if (CFG.server) { const j = await api({ action: "feedback", id: item.id, type: item.type, message: item.msg, email: item.email, meta: item.meta, store: item.store, owner: item.owner }); return !!j; }
  if (!CFG.web3formsKey) return false;
  const r = await fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ access_key: CFG.web3formsKey, subject: `OwnPOS feedback · ${item.type} · ${item.store}`, from_name: item.store, email: item.email || undefined, message: item.msg, type: item.type, store: item.store, owner: item.owner, device: item.meta || "not shared", sent: new Date(item.at).toString() }) });
  const j = await r.json().catch(() => ({})); return !!(r.ok && j.success);
}
let flushing = false;
async function flushOutbox() {
  if (flushing || !online || !P || !P.outbox.length || !(CFG.server || CFG.web3formsKey)) return;
  flushing = true; let sent = 0;
  for (const item of P.outbox.slice()) { try { if (await postFeedback(item)) { P.outbox = P.outbox.filter(x => x.id !== item.id); sent++; } else break; } catch (e) { break; } }
  flushing = false; if (sent) { save(); toast(`${sent} saved feedback sent`); render(); }
}
const gmailLink = (item) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(CFG.email)}&su=${encodeURIComponent("OwnPOS feedback · " + item.type)}&body=${encodeURIComponent(item.msg + "\n\n" + (item.meta || ""))}`;

/* =========================================================
   ACTIONS
   ========================================================= */
const A = {
  setuptype(el) { setupType = el.dataset.v; document.querySelectorAll('[data-act="setuptype"]').forEach(b => b.setAttribute("aria-pressed", b.dataset.v === setupType)); },
  tab(el) { tab = el.dataset.v; subMsg = null; render(); window.scrollTo(0, 0); },
  cat(el) { activeCat = el.dataset.v || null; render(); },
  add(el) { const l = cart.find(x => x.id === el.dataset.v); l ? l.qty++ : cart.push({ id: el.dataset.v, qty: 1 }); render(); },
  inc(el) { cart.find(x => x.id === el.dataset.v).qty++; refreshCart(); },
  dec(el) { const l = cart.find(x => x.id === el.dataset.v); l.qty--; if (l.qty <= 0) cart = cart.filter(x => x !== l); refreshCart(); },
  clearcart() { cart = []; discount = "none"; custName = ""; refreshCart(); },
  disc(el) { discount = el.dataset.v; refreshCart(); },
  otype(el) { P.orderType = el.dataset.v; save(); refreshCart(); },
  opencart() { openModal(`<div class="mhead"><span></span><button class="x" data-act="closemodal" aria-label="Close">×</button></div><div id="cartModal">${cartHTML(status())}</div>`); },
  checkout() { if (!cart.length) return; pay = { method: "Cash", tendered: "", ref: "", scId: "" }; openModal(payHTML()); },
  method(el) { pay.method = el.dataset.v; openModal(payHTML()); },
  tendq(el) { pay.tendered = el.dataset.v; openModal(payHTML()); },
  async confirmpay() {
    const t = cartTotals();
    if (discount === "scpwd" && !pay.scId.trim()) { toast("Enter the Senior / PWD ID number"); return; }
    const s = await recordSale({ items: cartItems(), method: pay.method, tendered: +pay.tendered || t.total, ref: pay.ref, discount, scId: pay.scId, orderType: P.orderType, customer: custName.trim() });
    cart = []; discount = "none"; custName = ""; render(); openReceipt(s.no, true);
  },
  receipt(el) { openReceipt(el.dataset.v); },
  showcust(el) { const s = P.sales.find(x => x.no === el.dataset.v); openModal(`<div class="mhead"><h2>Your receipt</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div><div class="showcust">${receiptHTML(s, true)}</div><p class="small muted" style="text-align:center">Take a photo, or scan the QR code with your phone camera.</p>`, true); },
  sharereceipt(el) { const s = P.sales.find(x => x.no === el.dataset.v); shareText("Receipt #" + s.no, receiptText(s)); },
  async csv() { const rows = [["receipt_no", "date_time", "order_type", "customer", "items", "subtotal", "discount", "total", "method", "reference"]].concat(P.sales.map(s => [s.no, new Date(s.ts).toISOString(), s.orderType || "", s.customer || "", s.items.map(i => `${i.qty}x ${i.name}`).join("; "), s.sub.toFixed(2), (s.disc + s.lessVat).toFixed(2), s.total.toFixed(2), s.method, s.ref])); await shareFile(`ownpos-sales-${iso(dayNum(Date.now()))}.csv`, rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv"); },
  verify() { const no = ($("#vno").value || "").trim().padStart(6, "0"), code = ($("#vcode").value || "").trim().toUpperCase().replace(/[^A-F0-9]/g, ""); const s = P.sales.find(x => x.no === no); $("#vres").innerHTML = s && s.code.replace("-", "") === code ? `<div class="result good">Genuine. #${s.no} · ${fmtDT(s.ts)} · ${peso(s.total)}</div>` : `<div class="result bad">No match. This number and code weren’t issued by this POS, or the photo was edited.</div>`; },
  editprod(el) { prodModal(el.dataset.v); },
  delprod(el) { P.products = P.products.filter(p => p.id !== el.dataset.v); cart = cart.filter(l => l.id !== el.dataset.v); save(); closeModal(); render(); toast("Item deleted"); },
  pimgclear() { $("#pimgData").value = ""; $("#pimgPrev").innerHTML = "Photo"; },
  catadd() { const v = ($("#newcat").value || "").trim(); if (v && !P.categories.includes(v)) { P.categories.push(v); save(); } render(); },
  catdel(el) { const i = +el.dataset.v, c = P.categories[i]; if (P.products.some(p => p.cat === c)) { toast(`Move or delete the items in “${c}” first`); return; } P.categories.splice(i, 1); save(); render(); },
  catup(el) { const i = +el.dataset.v; [P.categories[i - 1], P.categories[i]] = [P.categories[i], P.categories[i - 1]]; save(); render(); },
  preset(el) { const p = PRESETS.find(x => x.id === el.dataset.v); Object.assign(P.brand, { color: p.color, font: p.font, corners: p.corners }); save(); render(); },
  color(el) { P.brand.color = el.dataset.v; save(); render(); },
  font(el) { P.brand.font = el.dataset.v; save(); render(); },
  corners(el) { P.brand.corners = el.dataset.v; save(); render(); },
  tilesz(el) { P.brand.tile = el.dataset.v; save(); render(); },
  photos() { P.brand.photos = !P.brand.photos; save(); render(); },
  logoclear() { P.brand.logo = ""; save(); render(); },
  plan(el) { selPlan = el.dataset.v; const ref = $("#rref") ? $("#rref").value : ""; render(); if ($("#rref")) $("#rref").value = ref; },
  async sendrequest(el) {
    const ref = ($("#rref") && $("#rref").value.trim()) || "";
    if (CFG.server && online) {
      if (!ref) { toast("Enter the GCash reference number first"); $("#rref").focus(); return; }
      el.disabled = true; el.textContent = "Sending…";
      let ok = false; try { ok = !!(await api({ action: "renewal", store: P.brand.name, owner: `${P.owner.name} · ${P.owner.mobile}`, plan: selPlan, ref, exp: iso(status().exp) })); } catch (e) {}
      if (ok) { P.lastRequest = { at: Date.now(), plan: selPlan, ref }; save(); render(); toast("Renewal request sent"); return; }
      toast("Couldn’t reach OwnPOS. Send it by message instead.");
    }
    shareText("OwnPOS renewal request", requestText());
  },
  sharerequest() { shareText("OwnPOS renewal request", requestText()); },
  async scanlicense() {
    const bs = plug("BarcodeScanner");
    if (!isNative || !bs) { toast("Camera scanning works in the Android app. Paste the code instead."); return; }
    try {
      const { available } = await bs.isGoogleBarcodeScannerModuleAvailable();
      if (!available) { await bs.installGoogleBarcodeScannerModule(); toast("Getting the scanner ready. Try again in a few seconds."); return; }
      const { barcodes } = await bs.scan({ formats: ["QR_CODE"] });
      if (barcodes && barcodes[0]) await activate(barcodes[0].rawValue);
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast("Couldn’t open the scanner. Paste the code instead."); }
  },
  async activate() { await activate($("#licIn").value); },
  async checkupdate() { await checkUpdates(true); },
  openupdate() { if (!update) return; if (U.phase === "error" || U.phase === "installing" && !U.path) U = { phase: "ready" }; drawUpdate(); },
  async downloadupdate() { if (update && !cart.length) await startUpdate(); },
  async cancelupdate() { const au = plug("ApkUpdater"); if (au) { try { await au.cancel(); } catch (e) {} } U = { phase: "ready" }; drawUpdate(); },
  async installsettings() { const au = plug("ApkUpdater"); if (au) await au.openInstallSettings(); },
  async installnow() { await installUpdate(); },
  async browserupdate() { if (update) { await openUrl(update.url); closeModal(); } },
  openfeedback() { fb = fb && !fb.done ? fb : { type: "Idea", msg: "", email: "", meta: true }; openModal(feedbackHTML()); },
  fbtype(el) { fb.type = el.dataset.v; openModal(feedbackHTML()); },
  async sendfeedback() {
    if (!fb.msg.trim()) { toast("Write a message first"); return; }
    const item = { id: rnd(8), type: fb.type, msg: fb.msg.trim(), email: fb.email.trim(), meta: fb.meta ? metaLine() : "", store: P.brand.name, owner: `${P.owner.name} · ${P.owner.mobile}`, at: Date.now() };
    if (!CFG.server && !CFG.web3formsKey) { await openUrl(gmailLink(item)); fb.done = true; closeModal(); return; }
    let ok = false; if (online) { const btn = $('[data-act="sendfeedback"]'); btn.disabled = true; btn.textContent = "Sending…"; try { ok = await postFeedback(item); } catch (e) {} }
    if (!ok) { P.outbox.push(item); save(); }
    fb.done = true;
    openModal(`<div class="mhead"><h2>${ok ? "Thank you!" : "Saved"}</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div><p>${ok ? "Your feedback was sent to the OwnPOS team." : "Your feedback is saved on this device and will be sent when the internet comes back."}</p><button class="btn primary block" data-act="closemodal">Done</button>`);
    render();
  },
  async emailfeedback() { const item = { type: fb.type, msg: fb.msg.trim(), meta: fb.meta ? metaLine() : "" }; await openUrl(gmailLink(item)); },
  async backup() { await shareFile(`ownpos-backup-${P.brand.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${iso(dayNum(Date.now()))}.json`, JSON.stringify(P), "application/json"); },
  help(el) { const h = HELP[el.dataset.v]; if (!h) return; openModal(`<div class="mhead"><h2>${esc(h[0])}</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div><div class="stack"><p style="margin:0">${esc(h[1])}</p>${h[2] ? `<ul class="notes">${h[2].map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<button class="btn primary block" data-act="closemodal">Got it</button></div>`); },
  closemodal() { closeModal(); }
};
function refreshCart() { const cm = $("#cartModal"); if (cm) { if (!cart.length) closeModal(); else cm.innerHTML = cartHTML(status()); } render(); }

/* ---------- events ---------- */
document.addEventListener("click", e => {
  if (e.target.id === "modal") { closeModal(); return; }
  const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
  const fn = A[el.dataset.act]; if (fn) fn(el, e);
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  if (e.target.id === "setupForm") {
    const name = $("#s-name").value.trim(), owner = $("#s-owner").value.trim(), mobile = $("#s-mobile").value.trim();
    if (!name || !owner || !mobile) { toast("Fill in all three fields"); return; }
    P = newStore({ name, owner, mobile, type: setupType }); await save(true); await refreshLicense(); tab = "sell"; render(); toast("Your store is ready. Free for 30 days."); checkUpdates(); checkin();
  }
  if (e.target.id === "prodForm") {
    const id = e.target.dataset.id, name = $("#pname").value.trim(), price = parseFloat($("#pprice").value);
    if (!name || isNaN(price) || price < 0) { toast("Enter a name and a price"); return; }
    const data = { name, price: Math.round(price * 100) / 100, cat: $("#pcat").value, desc: $("#pdesc").value.trim(), img: $("#pimgData").value, on: $("#pon").checked };
    if (id) Object.assign(P.products.find(p => p.id === id), data); else P.products.push({ id: rnd(6), ...data });
    save(); closeModal(); render(); toast(id ? "Item saved" : "Item added");
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.brand) { P.brand[t.dataset.brand] = t.value; applyBrand(); const rp = $("#rprev"); if (rp && P.sales.length) { rp.innerHTML = receiptHTML(P.sales[P.sales.length - 1]); drawQRs(rp); } save(); return; }
  const a = t.dataset.actInput;
  if (a === "q") { query = t.value; const pos = t.selectionStart; render(); const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
  if (a === "tend") { pay.tendered = t.value; const tot = cartTotals().total, v = +t.value || 0; $("#chg").textContent = v >= tot ? peso(v - tot) : "—"; $("#confirmPay").disabled = v < tot; }
  if (a === "pref") pay.ref = t.value;
  if (a === "cust") { custName = t.value; document.querySelectorAll("#cust").forEach(x => { if (x !== t) x.value = t.value; }); }
  if (a === "scid") pay.scId = t.value;
  if (a === "fbmsg") fb.msg = t.value;
  if (a === "fbemail") fb.email = t.value;
});
document.addEventListener("change", async e => {
  const t = e.target, a = t.dataset.actChange;
  if (t.dataset.brandCheck) { P.brand[t.dataset.brandCheck] = t.checked; save(); render(); return; }
  if (t.dataset.brand) { save(); render(); return; }
  if (a === "role") { P.role = t.value; cart = []; save(); render(); }
  if (a === "toggleon") { P.products.find(x => x.id === t.dataset.v).on = t.checked; save(); }
  if (a === "fbmeta") { fb.meta = t.checked; openModal(feedbackHTML()); }
  if (a === "logo" && t.files[0]) { try { P.brand.logo = await readImage(t.files[0], 240); save(); render(); } catch (err) { toast("Couldn’t read that image. Try a JPG or PNG."); } }
  if (a === "pimg" && t.files[0]) { try { const d = await readImage(t.files[0], 360); $("#pimgData").value = d; $("#pimgPrev").innerHTML = `<img src="${d}" alt="">`; } catch (err) { toast("Couldn’t read that image."); } }
  if (a === "restore" && t.files[0]) {
    try { const data = JSON.parse(await t.files[0].text()); if (!data || !data.deviceId || !data.brand || !Array.isArray(data.sales)) throw 0;
      openModal(`<div class="mhead"><h2>Restore this backup?</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></div><p><b>${esc(data.brand.name)}</b> · ${data.sales.length} sales · ${data.products.length} menu items.</p><p class="muted">This replaces everything currently on this device.</p><div class="row"><button class="btn primary" id="doRestore">Restore</button><button class="btn" data-act="closemodal">Cancel</button></div>`);
      $("#doRestore").onclick = async () => { P = data; P.outbox = P.outbox || []; await save(true); await refreshLicense(); closeModal(); render(); toast("Backup restored"); };
    } catch (err) { toast("That file isn’t an OwnPOS backup."); }
    t.value = "";
  }
});

/* ---------- boot ---------- */
(async function boot() {
  P = await loadData();
  if (P) { P.outbox = P.outbox || []; await refreshLicense(); }
  await initNetwork();
  const dev = plug("Device"); if (isNative && dev) { try { const i = await dev.getInfo(); deviceInfo = `${i.manufacturer || ""} ${i.model || ""} · Android ${i.osVersion || ""}`.trim(); } catch (e) {} }
  const app = plug("App");
  if (isNative && app) {
    app.addListener("backButton", () => { if (modalOpen() && U.phase === "downloading") return; if (modalOpen()) closeModal(); else if (tab !== "sell") { tab = "sell"; render(); } else app.minimizeApp(); });
    app.addListener("resume", () => { if (U.phase === "permission" && U.path) installUpdate(); if (P && Date.now() - (P.lastCheck || 0) > 6 * 3600000) checkUpdates(); if (P) { checkin(); render(); } });
    app.addListener("pause", () => { if (P) save(true); });
  }
  render();
  if (P) { flushOutbox(); checkUpdates(); checkin(); }
  setInterval(() => { if (P && online && Date.now() - (P.lastCheck || 0) > 6 * 3600000) checkUpdates(); if (P && online && Date.now() - (P.lastCheckin || 0) > 3600000) checkin(); }, 15 * 60000);
  setInterval(() => { if (P && !modalOpen() && tab !== "sell") render(); }, 60000);
})();
