#!/usr/bin/env node
// Derives a light theme from a dark one: every colour is inverted around the background with its hue
// kept. Neutrals keep their contrast, text hues land at 3.7-5.4:1 with more chroma, and dark tints
// become pastel tints.
//
//   node config/themes/invert.mjs                 regenerate every recipe below, in place
//   node config/themes/invert.mjs NAME --out DIR  write under DIR instead, to diff before overwriting
//
// A new theme is one RECIPES entry. Run the theme and nvim tests afterwards; where an inverted value
// fails one, add a fix to the recipe instead of editing the output, so a rerun keeps it.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const RECIPES = {
  "coffee-light": {
    from: "coffee-sky",
    background: "#faf4ed", // Rosé Pine Dawn's cream
    ink: "#3f342d", // the hue of body text and of the grey ramp
    // Inverted values the tests reject: three editor groups under 3:1, and a window border that has to stay neutral.
    fixes: [
      ["coffee-light.lua", "'LeapMatch', { fg = '#a79683'", "'LeapMatch', { fg = '#faf4ed'"],
      ["coffee-light.lua", "'MatchParen', { fg = '#33708e', bg = '#b4ada7'", "'MatchParen', { fg = '#33708e', bg = '#d3ccc6'"],
      ["coffee-light.lua", "'RenderMarkdownH4Bg', { fg = '#ae7504'", "'RenderMarkdownH4Bg', { fg = '#926600'"],
      ["colors.sh", "BORDER_ACTIVE=0xff8b837d", "BORDER_ACTIVE=0xff6f6d6b"],
    ],
  },
};
const FILES = "kitty.conf marta.ettyTheme btop.theme lazygit.yml yazi.toml colors.sh syntax.tmTheme marta.theme vicinae.toml delta.gitconfig hunk.toml pi.json".split(" ");
// p10k paints its fill in colour 234 and its frame in 238; these are their contrasts on the background, 232 to 238.
const PROMPT_RAMP = [1.03, 1.06, 1.1, 1.2, 1.5, 1.65, 1.8];

// Colour maths: sRGB hex, WCAG luminance and contrast, OKLCH.
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v * t + rgb(b)[i] * (1 - t)));
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lch = (h) => {
  const [r, g, b] = rgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
};
const toLinear = ([L, C, H]) => {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
};
// Drop chroma until the colour fits sRGB.
const fit = (L, C, H) => { while (C > 0 && !toLinear([L, C, H]).every((v) => v >= -0.0005 && v <= 1.0005)) C -= 0.003; return [L, Math.max(C, 0), H]; };
const toHex = (v) => hex(toLinear(v).map((x) => { x = Math.max(0, Math.min(1, x)); return (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255; }));
// The colour of this hue and chroma whose luminance is Y.
const solve = (H, C, Y) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (lum(toHex(fit(mid, C, H))) < Y) lo = mid; else hi = mid; }
  return toHex(fit((lo + hi) / 2, C, H));
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A converter from the dark theme's colours to the light theme's. */
function converter(darkBg, darkFg, { background, ink }) {
  const Yb = lum(darkBg), Yl = lum(background), cache = new Map();
  // Contrast ratios are raised to k, so the dark theme's text contrast maps onto the ink's.
  const k = Math.log(cr(ink, background)) / Math.log(cr(darkFg, darkBg));
  const [, inkC, inkH] = lch(ink), deep = toHex(fit(0.16, inkC, inkH));
  const ramp = (target) => { let x = 0, out = background; while (cr(out, background) < target && x < 1) { x += 0.002; out = mix(deep, background, x); } return out; };
  const lighter = (Y) => { let x = 0, out = background; while (lum(out) < Y && x < 1) { x += 0.01; out = mix("#ffffff", background, x); } return out; };
  const convert = (h) => {
    h = h.toLowerCase();
    if (cache.has(h)) return cache.get(h);
    const Ys = lum(h);
    let [, C, H] = lch(h), out;
    if (Ys < Yb) {
      // Darker than the dark background (insets): lighter than the light one.
      const Y = Math.min(1, (Yl + 0.05) * ((Yb + 0.05) / (Ys + 0.05)) ** k - 0.05);
      out = C < 0.012 ? lighter(Y) : solve(H, C, Y);
    } else {
      const r = (Ys + 0.05) / (Yb + 0.05);
      let target = r ** k, chroma = C;
      if (C < 0.012) out = ramp(target);
      else {
        if (r >= 3 && C >= 0.05) {
          // Text hues: a narrow contrast band, more chroma. Yellow is unreadable on cream, so it turns amber.
          target = clamp(4.3 + 0.18 * (r - 8), 3.7, 5.4);
          chroma = Math.min(C * 1.25, 0.17);
          if (H > 90 && H < 106) { H = 75; target = 3.6; }
        } else if (r < 3) chroma = C * 1.2; // tints
        out = solve(H, chroma, (Yl + 0.05) / target - 0.05);
      }
    }
    cache.set(h, out);
    return out;
  };
  return { convert, ramp };
}

const title = (name) => name.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");

function build(name, recipe, repo, out) {
  const read = (file) => fs.readFileSync(path.join(repo, file), "utf8");
  const kitty = read(`config/themes/${recipe.from}/kitty.conf`);
  const setting = (text, key) => text.match(new RegExp("^" + key + "\\s+(#\\w{6})", "m"))[1];
  const { convert, ramp } = converter(setting(kitty, "background"), setting(kitty, "foreground"), recipe);
  const recolour = (text) => text
    .replace(/#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?(?![0-9a-fA-F])/g, (_, colour, alpha) => convert("#" + colour) + (alpha || ""))
    .replace(/0x(ff|FF)([0-9a-fA-F]{6})\b/g, (_, alpha, colour) => "0x" + alpha + convert("#" + colour).slice(1));
  const rename = (text) => text.replaceAll(title(recipe.from), title(name)).replaceAll(recipe.from, name);
  const edits = {
    "pi.json": (t) => t.replace('"appearance": "dark"', '"appearance": "light"'),
    "kitty.conf": (t) => PROMPT_RAMP.reduce((text, ratio, i) => text.replace(new RegExp("^(color" + (232 + i) + "\\s+)#\\w{6}", "m"), "$1" + ramp(ratio)), t),
    "marta.theme": (t) => t.replace('appearance "dark"', 'appearance "light"'),
    "vicinae.toml": (t) => t.replace('variant = "dark"', 'variant = "light"').replace("vicinae-dark", "vicinae-light"),
    "hunk.toml": (t) => t.replace("github-dark-default", "github-light-default"),
  };
  const outputs = new Map(FILES.map((file) => {
    const text = (edits[file] ?? ((t) => t))(recolour(read(`config/themes/${recipe.from}/${file}`)));
    return [`config/themes/${name}/${file}`, rename(text)];
  }));
  outputs.set(`config/nvim/colors/${name}.lua`, rename(recolour(read(`config/nvim/colors/${recipe.from}.lua`)).replace("vim.o.background = 'dark'", "vim.o.background = 'light'")));
  for (const [file, from, to] of recipe.fixes ?? []) {
    const target = [...outputs.keys()].find((key) => path.basename(key) === file);
    if (!target || !outputs.get(target).includes(from)) throw new Error(`${name}: fix for ${file} no longer matches: ${from}`);
    outputs.set(target, outputs.get(target).replace(from, to));
  }
  for (const [file, text] of outputs) {
    fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
    fs.writeFileSync(path.join(out, file), text);
  }
  const light = outputs.get(`config/themes/${name}/kitty.conf`), bg = setting(light, "background");
  const ratio = (key) => cr(setting(light, key), bg).toFixed(2);
  console.log(`${name}: ${outputs.size} files from ${recipe.from}; text ${ratio("foreground")}:1, prompt fill ${ratio("color234")}, frame ${ratio("color238")}`);
}

const repo = path.resolve(import.meta.dirname, "../..");
const { values, positionals } = parseArgs({ options: { out: { type: "string" } }, allowPositionals: true });
for (const name of positionals.length ? positionals : Object.keys(RECIPES)) {
  if (!RECIPES[name]) throw new Error(`no recipe for ${name}; known: ${Object.keys(RECIPES).join(", ")}`);
  build(name, RECIPES[name], repo, values.out ? path.resolve(values.out) : repo);
}
