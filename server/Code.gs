/**
 * OwnPOS Server — runs free inside your Google account (Google Apps Script + this Google Sheet).
 *
 * What stores' apps send here when they're online:
 *   - check-in: store name, owner, mobile, app version, plan and end date (never sales or menus)
 *   - feedback: emailed to you and saved in the Feedback tab
 *   - renewal requests: emailed to you and shown on your dashboard to approve
 * Licenses you approve on the dashboard reach the store's app at its next check-in.
 *
 * Setup: see SETUP.md in the OwnPOS repository.
 */
const ADMIN_EMAIL = "areedzgonzales@gmail.com";
const TZ = "Asia/Manila";
const PRICES = { Monthly: 500, Quarterly: 1500, Annual: 5000 };

const TABS = {
  Stores: ["deviceId", "store", "owner", "mobile", "storeType", "plan", "planStart", "planEnd", "version", "device", "firstSeen", "lastSeen", "note"],
  Requests: ["id", "at", "deviceId", "store", "owner", "plan", "amount", "ref", "currentEnd", "status", "handledAt"],
  Licenses: ["at", "deviceId", "store", "plan", "amount", "start", "end", "ref", "requestId", "token"],
  Feedback: ["id", "at", "deviceId", "store", "owner", "type", "message", "email", "meta", "read"],
};

/* ---------------- sheet helpers ---------------- */
function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}
function rows_(name) {
  const sh = sheet_(name), cols = TABS[name], n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, cols.length).getValues().map((r, i) => {
    const o = { _row: i + 2 };
    cols.forEach((c, j) => (o[c] = r[j] instanceof Date ? Utilities.formatDate(r[j], TZ, "yyyy-MM-dd") : String(r[j])));
    return o;
  });
}
// Everything is stored as plain text so Sheets never turns 0918… into a number or 2026-12-23 into a date.
function append_(name, obj) {
  const sh = sheet_(name), cols = TABS[name];
  sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setNumberFormat("@").setValues([cols.map(c => (obj[c] === undefined || obj[c] === null ? "" : String(obj[c])))]);
}
function update_(name, row, obj) {
  const sh = sheet_(name), cols = TABS[name];
  Object.keys(obj).forEach(k => { const j = cols.indexOf(k); if (j >= 0) sh.getRange(row, j + 1).setNumberFormat("@").setValue(String(obj[k] == null ? "" : obj[k])); });
}
const now_ = () => new Date().toISOString();
const today_ = () => Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
const str_ = (v, n) => String(v == null ? "" : v).slice(0, n || 200);
const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const validDevice_ = d => /^OWN-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(d || ""));
function mail_(subject, body) { try { MailApp.sendEmail({ to: ADMIN_EMAIL, subject: subject, body: body, name: "OwnPOS" }); } catch (e) { console.warn("mail failed", e); } }

/* ---------------- app API (POST) ---------------- */
function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { return json_({ ok: false, error: "bad json" }); }
  if (!validDevice_(req.deviceId)) return json_({ ok: false, error: "bad device" });
  // Simple spam guard: at most 30 calls per device per 10 minutes.
  const cache = CacheService.getScriptCache(), ck = "rate:" + req.deviceId, n = Number(cache.get(ck) || 0);
  if (n > 30) return json_({ ok: false, error: "slow down" });
  cache.put(ck, String(n + 1), 600);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (req.action === "checkin") return json_(checkin_(req));
    if (req.action === "feedback") return json_(feedback_(req));
    if (req.action === "renewal") return json_(renewal_(req));
    return json_({ ok: false, error: "unknown action" });
  } finally { lock.releaseLock(); }
}

function checkin_(r) {
  const s = rows_("Stores").find(x => x.deviceId === r.deviceId);
  const data = {
    deviceId: r.deviceId, store: str_(r.store, 80), owner: str_(r.owner, 80), mobile: str_(r.mobile, 30), storeType: str_(r.storeType, 30),
    plan: str_(r.plan, 20), planStart: str_(r.start, 10), planEnd: str_(r.exp, 10), version: str_(r.version, 20), device: str_(r.device, 80), lastSeen: now_(),
  };
  if (s) update_("Stores", s._row, data);
  else {
    append_("Stores", Object.assign({ firstSeen: now_(), note: "" }, data));
    mail_(`New OwnPOS store: ${data.store}`, `${data.store} started OwnPOS.\n\nOwner: ${data.owner} · ${data.mobile}\nType: ${data.storeType}\nDevice: ${data.deviceId}\nTrial ends: ${data.planEnd}`);
  }
  // Deliver the newest license that ends later than what the app has now.
  const lic = rows_("Licenses").filter(l => l.deviceId === r.deviceId && String(l.end) > String(r.exp || "")).sort((a, b) => String(b.end).localeCompare(String(a.end)))[0];
  return { ok: true, license: lic ? lic.token : null, serverDate: today_() };
}

function feedback_(r) {
  const id = str_(r.id, 20) || Utilities.getUuid().slice(0, 8);
  if (rows_("Feedback").some(f => f.id === id)) return { ok: true, duplicate: true };
  const f = { id, at: now_(), deviceId: r.deviceId, store: str_(r.store, 80), owner: str_(r.owner, 80), type: str_(r.type, 20), message: str_(r.message, 4000), email: str_(r.email, 120), meta: str_(r.meta, 200), read: false };
  append_("Feedback", f);
  mail_(`OwnPOS feedback · ${f.type} · ${f.store}`, `${f.message}\n\n— ${f.owner}${f.email ? " · " + f.email : ""}\n${f.store} · ${f.deviceId}\n${f.meta}`);
  return { ok: true };
}

function renewal_(r) {
  const plan = PRICES[r.plan] ? r.plan : "Monthly";
  const q = { id: Utilities.getUuid().slice(0, 8), at: now_(), deviceId: r.deviceId, store: str_(r.store, 80), owner: str_(r.owner, 80), plan, amount: PRICES[plan], ref: str_(r.ref, 40), currentEnd: str_(r.exp, 10), status: "pending", handledAt: "" };
  append_("Requests", q);
  mail_(`Payment to verify: ${q.store} · ₱${q.amount}`, `${q.store} sent a renewal request.\n\nPlan: ${plan} (₱${q.amount})\nGCash reference: ${q.ref || "not entered"}\nOwner: ${q.owner}\nDevice: ${q.deviceId}\n\nCheck GCash, then approve it on your OwnPOS dashboard:\n${ScriptApp.getService().getUrl()}`);
  return { ok: true, id: q.id };
}

/* ---------------- admin dashboard (GET + google.script.run) ---------------- */
function doGet() {
  return HtmlService.createHtmlOutputFromFile("Dashboard").setTitle("OwnPOS Admin")
    .addMetaTag("viewport", "width=device-width, initial-scale=1").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
function pinState() { return { hasPin: !!PropertiesService.getScriptProperties().getProperty("ADMIN_PIN") }; }
function createPin(pin) {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty("ADMIN_PIN")) throw new Error("A PIN is already set.");
  if (!/^\d{6,}$/.test(String(pin))) throw new Error("Use at least 6 digits.");
  p.setProperty("ADMIN_PIN", hash_(pin));
  return true;
}
function hash_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "ownpos:" + s)); }
function check_(pin) {
  const cache = CacheService.getScriptCache(), fails = Number(cache.get("pinfails") || 0);
  if (fails >= 10) throw new Error("Too many wrong PINs. Wait 15 minutes.");
  if (hash_(pin) !== PropertiesService.getScriptProperties().getProperty("ADMIN_PIN")) {
    cache.put("pinfails", String(fails + 1), 900);
    throw new Error("Wrong PIN.");
  }
}
function adminLoad(pin) {
  check_(pin);
  return { stores: rows_("Stores"), requests: rows_("Requests"), licenses: rows_("Licenses").map(l => Object.assign(l, { token: "" })), feedback: rows_("Feedback"), today: today_(), sheetUrl: SpreadsheetApp.getActive().getUrl() };
}
function adminSaveLicense(pin, l) {
  check_(pin);
  if (!validDevice_(l.deviceId) || !/^OWNPOS1\.[\w-]+\.[\w-]+$/.test(l.token)) throw new Error("That license doesn't look right.");
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    append_("Licenses", { at: now_(), deviceId: l.deviceId, store: str_(l.store, 80), plan: str_(l.plan, 20), amount: Number(l.amount) || 0, start: l.start, end: l.end, ref: str_(l.ref, 40), requestId: str_(l.requestId, 20), token: l.token });
    if (l.requestId) { const q = rows_("Requests").find(x => x.id === l.requestId); if (q) update_("Requests", q._row, { status: "approved", handledAt: now_() }); }
  } finally { lock.releaseLock(); }
  return adminLoad(pin);
}
function adminReject(pin, id) {
  check_(pin);
  const q = rows_("Requests").find(x => x.id === id); if (q) update_("Requests", q._row, { status: "rejected", handledAt: now_() });
  return adminLoad(pin);
}
function adminMarkRead(pin, id) {
  check_(pin);
  rows_("Feedback").forEach(f => { if ((id === "*" || f.id === id) && String(f.read) !== "true") update_("Feedback", f._row, { read: true }); });
  return adminLoad(pin);
}
function adminNote(pin, deviceId, note) {
  check_(pin);
  const s = rows_("Stores").find(x => x.deviceId === deviceId); if (s) update_("Stores", s._row, { note: str_(note, 300) });
  return adminLoad(pin);
}
