import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * Locks the minimum text contrast (WCAG AA, 4.5:1) of every style x palette x light/dark in styles.css. It reads the
 * CSS itself with a tiny resolver (var() with fallback, hex/rgb(), color-mix in srgb), so a new palette or a changed
 * value that makes text hard to read fails here. Translucent glass layers are composited over the palette background
 * (the blurred gradient blobs behind a card are not modelled).
 */

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

type Block = { selectors: string[]; props: [string, string][] };

function parseBlocks(src: string): Block[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^@[^{};]*;/gm, ""); // comments, @import, @custom-variant
  const blocks: Block[] = [];
  // top-level `selector { decls }` only: at-rules (@theme, @layer, @keyframes) start with `@` or contain nested braces
  const re = /(?:^|(?<=\}))\s*([^{}@]+?)\s*\{([^{}]*)\}/g;
  for (let m = re.exec(noComments); m; m = re.exec(noComments)) {
    const props: [string, string][] = [];
    for (const d of (m[2] ?? "").split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      const name = d.slice(0, i).trim();
      if (name.startsWith("--")) props.push([name, d.slice(i + 1).trim()]);
    }
    if (props.length) blocks.push({ selectors: (m[1] ?? "").split(/,(?![^(]*\))/).map((s) => s.trim()), props });
  }
  return blocks;
}

const blocks = parseBlocks(css);
const STYLES = ["saas", "glass", "mono"];
const PALETTES = ["aurora", ...[...css.matchAll(/\[data-palette="(\w+)"\]\s*\{/g)].map((m) => m[1] as string)].filter(
  (p, i, a) => a.indexOf(p) === i,
);

function applies(selector: string, style: string, palette: string, dark: boolean): boolean {
  const s = selector.match(/data-style="(\w+)"/)?.[1];
  const p = selector.match(/data-palette="(\w+)"/)?.[1];
  if (s && s !== style) return false;
  if (p && p !== palette) return false;
  if (/\.dark\s*$/.test(selector) && !dark) return false;
  return /data-style|data-palette|:root/.test(selector);
}

function environment(style: string, palette: string, dark: boolean): Map<string, string> {
  const env = new Map<string, string>();
  for (const b of blocks) {
    if (!b.selectors.some((sel) => applies(sel, style, palette, dark))) continue;
    for (const [k, v] of b.props) {
      if (v === "initial") env.delete(k);
      else env.set(k, v);
    }
  }
  return env;
}

type RGBA = [number, number, number, number]; // r, g, b 0-255, a 0-1

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function substitute(value: string, env: Map<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop in ${value}`);
  let out = value;
  for (let i = out.indexOf("var("); i >= 0; i = out.indexOf("var(")) {
    let d = 0;
    let j = i + 3;
    for (; j < out.length; j++) {
      if (out[j] === "(") d++;
      if (out[j] === ")" && --d === 0) break;
    }
    const [name, ...fb] = splitTop(out.slice(i + 4, j));
    const raw = env.get(name ?? "");
    const repl = raw !== undefined ? raw : fb.join(",");
    if (!repl) throw new Error(`unresolved ${name}`);
    out = out.slice(0, i) + substitute(repl, env, depth + 1) + out.slice(j + 1);
  }
  return out;
}

function parseColor(input: string): RGBA {
  const v = input.trim();
  if (v === "transparent") return [0, 0, 0, 0];
  if (v.startsWith("#")) {
    const h = v.length === 4 ? [...v.slice(1)].map((c) => c + c).join("") : v.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgb = v.match(/^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  const mix = v.match(/^color-mix\(in srgb,(.*)\)$/s);
  if (mix) {
    type Part = { c: RGBA; p: number };
    const [a, b] = splitTop(mix[1] ?? "").map((part): Part => {
      const m = part.match(/^(.*?)\s+([\d.]+)%$/s);
      return m ? { c: parseColor(m[1] ?? ""), p: Number(m[2]) / 100 } : { c: parseColor(part), p: NaN };
    }) as [Part, Part];
    if (Number.isNaN(a.p)) a.p = Number.isNaN(b.p) ? 0.5 : 1 - b.p;
    if (Number.isNaN(b.p)) b.p = 1 - a.p;
    const alpha = a.c[3] * a.p + b.c[3] * b.p;
    if (alpha === 0) return [0, 0, 0, 0];
    const ch = (i: 0 | 1 | 2) => (a.c[i] * a.c[3] * a.p + b.c[i] * b.c[3] * b.p) / alpha; // premultiplied mix
    return [ch(0), ch(1), ch(2), alpha];
  }
  throw new Error(`cannot parse colour: ${input}`);
}

function over(top: RGBA, base: RGBA): RGBA {
  const a = top[3] + base[3] * (1 - top[3]);
  const ch = (i: 0 | 1 | 2) => (top[i] * top[3] + base[i] * base[3] * (1 - top[3])) / a;
  return [ch(0), ch(1), ch(2), a];
}

function luminance([r, g, b]: RGBA): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGBA, b: RGBA): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const MIN = 4.5;

describe("text contrast of styles.css", () => {
  it("covers all palettes", () => {
    expect(PALETTES.sort()).toEqual(["aurora", "graphite", "mint", "ocean", "rose", "sunset"]);
  });

  for (const style of STYLES) {
    for (const palette of PALETTES) {
      for (const dark of [false, true]) {
        it(`${style} / ${palette} / ${dark ? "dark" : "light"} reaches ${MIN}:1`, () => {
          const env = environment(style, palette, dark);
          const color = (name: string) => parseColor(substitute(`var(${name})`, env));
          const page = over(color("--page-bg"), [255, 255, 255, 1]);
          const card = over(color("--card"), page);
          const sidebar = over(color("--sidebar"), page);
          const low: string[] = [];
          const check = (label: string, fg: RGBA, bg: RGBA) => {
            const r = contrast(over(fg, bg), bg);
            if (r < MIN) low.push(`${label} ${r.toFixed(2)}`);
          };

          check("text on card", color("--card-foreground"), card);
          check("muted text on card", color("--muted-foreground"), card);
          check("text on page", color("--foreground"), page);
          check("text on sidebar", color("--sidebar-foreground"), sidebar);
          check("accent text on accent", color("--accent-foreground"), over(color("--accent"), card));
          check(
            "sidebar accent text",
            color("--sidebar-accent-foreground"),
            over(color("--sidebar-accent"), sidebar),
          );
          // the primary button is a gradient in glass, so both ends count
          const buttonBgs = style === "glass" ? ["--grad-from", "--grad-to"] : ["--primary"];
          for (const bg of buttonBgs) check(`button text on ${bg}`, color("--primary-foreground"), color(bg));

          expect(low, low.join("; ")).toEqual([]);
        });
      }
    }
  }
});
