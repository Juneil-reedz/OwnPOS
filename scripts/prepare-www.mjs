// Builds www/ from src/: copies the app, bundles fonts and the QR library for offline use,
// and writes config.js from environment variables (set by GitHub Actions secrets).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const www = path.join(root, "www");
const nm = path.join(root, "node_modules");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(path.join(www, "vendor", "fonts"), { recursive: true });
for (const f of fs.readdirSync(path.join(root, "src"))) fs.copyFileSync(path.join(root, "src", f), path.join(www, f));
fs.copyFileSync(path.join(nm, "qrcodejs", "qrcode.js"), path.join(www, "vendor", "qrcode.js"));

const FONTS = [
  ["Figtree", "figtree", [400, 500, 600, 700, 800]],
  ["Fraunces", "fraunces", [400, 600, 700]],
  ["Baloo 2", "baloo-2", [400, 600, 700]],
  ["Bricolage Grotesque", "bricolage-grotesque", [400, 600, 700, 800]],
  ["IBM Plex Mono", "ibm-plex-mono", [400, 500, 600]],
];
let css = "";
for (const [family, dir, weights] of FONTS) {
  for (const w of weights) {
    const file = `${dir}-latin-${w}-normal.woff2`;
    const src = path.join(nm, "@fontsource", dir, "files", file);
    if (!fs.existsSync(src)) { console.warn("missing font", file); continue; }
    fs.copyFileSync(src, path.join(www, "vendor", "fonts", file));
    css += `@font-face{font-family:"${family}";font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${file}) format("woff2")}\n`;
  }
}
fs.writeFileSync(path.join(www, "vendor", "fonts.css"), css);

const publicKey = JSON.parse(fs.readFileSync(path.join(root, "license-public-key.json"), "utf8"));
const version = (process.env.OWNPOS_VERSION || pkg.version).replace(/^v/, "");
const cfg = {
  version,
  repo: process.env.OWNPOS_REPO || "Juneil-reedz/OwnPOS",
  web3formsKey: process.env.WEB3FORMS_KEY || "",
  email: process.env.OWNPOS_EMAIL || "areedzgonzales@gmail.com",
  gcashName: process.env.GCASH_NAME || "Fatima Reedzqha Asaad",
  gcashNumber: process.env.GCASH_NUMBER || "0927 064 6946",
  publicKey,
};
fs.writeFileSync(path.join(www, "config.js"), "window.OWNPOS_CONFIG=" + JSON.stringify(cfg) + ";\n");
console.log(`www ready · OwnPOS ${version} · feedback ${cfg.web3formsKey ? "on" : "email fallback"} · gcash ${cfg.gcashNumber ? "set" : "not set"}`);
