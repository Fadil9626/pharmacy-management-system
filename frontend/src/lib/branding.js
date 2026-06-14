// ── Theme studio ────────────────────────────────────────────
// A theme config = { preset, primary, secondary, sidebar_bg, sidebar_text,
// topbar_bg, topbar_text }. `primary` drives the whole brand ramp (--brand-*);
// the rest theme the chrome. When a chrome colour is null the app falls back to
// the CSS defaults, which respect light/dark mode (see index.css).

export const THEME_PRESETS = [
  { key: "apothecary", name: "Apothecary", default: true,
    primary: "#059669", secondary: "#14b8a6", sidebar_bg: null, sidebar_text: null, topbar_bg: null, topbar_text: null },
  { key: "ocean", name: "Ocean Blue",
    primary: "#0284c7", secondary: "#38bdf8", sidebar_bg: "#0c2742", sidebar_text: "#e2f1fb", topbar_bg: "#ffffff", topbar_text: "#0f172a" },
  { key: "midnight", name: "Midnight Lab",
    primary: "#6366f1", secondary: "#818cf8", sidebar_bg: "#0b1020", sidebar_text: "#e5e7eb", topbar_bg: "#11162a", topbar_text: "#e5e7eb" },
  { key: "emerald-med", name: "Emerald Medical",
    primary: "#059669", secondary: "#34d399", sidebar_bg: "#064e3b", sidebar_text: "#d1fae5", topbar_bg: "#ffffff", topbar_text: "#0f172a" },
  { key: "rose-clinic", name: "Rose Clinic",
    primary: "#e11d48", secondary: "#fb7185", sidebar_bg: "#4c0519", sidebar_text: "#ffe4e6", topbar_bg: "#ffffff", topbar_text: "#0f172a" },
  { key: "teal-science", name: "Teal Science",
    primary: "#0d9488", secondary: "#2dd4bf", sidebar_bg: "#042f2e", sidebar_text: "#ccfbf1", topbar_bg: "#ffffff", topbar_text: "#0f172a" },
  { key: "deep-violet", name: "Deep Violet",
    primary: "#7c3aed", secondary: "#a78bfa", sidebar_bg: "#1e0a47", sidebar_text: "#ede9fe", topbar_bg: "#ffffff", topbar_text: "#111827" },
  { key: "cobalt", name: "Cobalt Sky",
    primary: "#2563eb", secondary: "#60a5fa", sidebar_bg: "#0f1b3d", sidebar_text: "#dbeafe", topbar_bg: "#ffffff", topbar_text: "#0f172a" },
  { key: "amber-pro", name: "Amber Pro",
    primary: "#d97706", secondary: "#f59e0b", sidebar_bg: "#2a1a05", sidebar_text: "#fde68a", topbar_bg: "#ffffff", topbar_text: "#0f172a" },
  { key: "carbon", name: "Carbon Dark",
    primary: "#3b82f6", secondary: "#22d3ee", sidebar_bg: "#0a0a0a", sidebar_text: "#e5e7eb", topbar_bg: "#111111", topbar_text: "#e5e7eb" },
  { key: "royal-slate", name: "Royal Slate",
    primary: "#4f46e5", secondary: "#818cf8", sidebar_bg: "#1e293b", sidebar_text: "#e2e8f0", topbar_bg: "#ffffff", topbar_text: "#0f172a" },
];

export const DEFAULT_PRESET = THEME_PRESETS[0];
// The fields shown as individual colour controls in the studio
export const CUSTOM_FIELDS = [
  { key: "primary", label: "Primary brand color", hint: "Buttons, active links, highlights" },
  { key: "secondary", label: "Secondary color", hint: "Accents & secondary buttons" },
  { key: "sidebar_bg", label: "Sidebar background", hint: "Main navigation background" },
  { key: "sidebar_text", label: "Sidebar text", hint: "Navigation item text" },
  { key: "topbar_bg", label: "Top bar background", hint: "Header area background" },
  { key: "topbar_text", label: "Top bar text", hint: "Header greeting & labels" },
];

export const presetByKey = (k) => THEME_PRESETS.find((p) => p.key === k);

// ── colour helpers ─────────────────────────────────────────
const hexToRgb = (hex) => {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const triplet = (hex) => hexToRgb(hex).join(" ");
const mix = (rgb, target, ratio) => rgb.map((c, i) => Math.round(c * (1 - ratio) + target[i] * ratio));
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
const luminance = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const isLight = (hex) => luminance(hex) > 0.6;

// Full Tailwind-style ramp from one base colour (treated as shade 600).
export function paletteFromColor(hex) {
  const base = hexToRgb(hex);
  const steps = { 50: ["t", 0.95], 100: ["t", 0.88], 200: ["t", 0.74], 300: ["t", 0.58], 400: ["t", 0.33], 500: ["t", 0.14], 600: ["b", 0], 700: ["s", 0.14], 800: ["s", 0.30], 900: ["s", 0.44], 950: ["s", 0.60] };
  const out = {};
  for (const [shade, [kind, ratio]] of Object.entries(steps)) {
    out[shade] = (kind === "t" ? mix(base, WHITE, ratio) : kind === "s" ? mix(base, BLACK, ratio) : base).join(" ");
  }
  return out;
}

const CHROME_VARS = ["--sidebar-bg", "--sidebar-text", "--sidebar-hover", "--topbar-bg", "--topbar-text"];

// Apply a full theme config: brand ramp + accent + chrome.
export function applyThemeConfig(cfg) {
  const c = cfg || {};
  const root = document.documentElement;
  let css = "";
  const setVar = (n, v) => { root.style.setProperty(n, v); css += `${n}:${v};`; };

  const primary = c.primary || DEFAULT_PRESET.primary;
  for (const [s, rgb] of Object.entries(paletteFromColor(primary))) setVar(`--brand-${s}`, rgb);

  const secondary = c.secondary || primary;
  setVar("--accent", triplet(secondary));
  setVar("--accent-contrast", isLight(secondary) ? "17 24 39" : "255 255 255");

  // Chrome: clear first so unset colours fall back to CSS (dark-mode-aware) defaults.
  CHROME_VARS.forEach((v) => root.style.removeProperty(v));
  if (c.sidebar_bg) {
    setVar("--sidebar-bg", triplet(c.sidebar_bg));
    setVar("--sidebar-text", triplet(c.sidebar_text || "#ffffff"));
    setVar("--sidebar-hover", isLight(c.sidebar_bg) ? "0 0 0" : "255 255 255");
  }
  if (c.topbar_bg) {
    setVar("--topbar-bg", triplet(c.topbar_bg));
    setVar("--topbar-text", triplet(c.topbar_text || "#0f172a"));
  }

  try { localStorage.setItem("remedy-brand-css", css); } catch {}
}

// Back-compat: derive a config from legacy settings (theme + brand_color).
export function legacyConfig(settings) {
  if (settings?.theme_config) return settings.theme_config;
  const color = settings?.theme === "custom" ? settings?.brand_color
    : (presetByKey(settings?.theme)?.primary || settings?.brand_color);
  return { primary: color || DEFAULT_PRESET.primary };
}

// Read an image File, downscale, return a small PNG data URL.
export function fileToLogo(file, maxEdge = 256) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image could not be loaded"));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
