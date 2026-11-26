import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = process.argv[2] || path.join(root, "blixtbo.html");

const chunkDir = path.join(root, "out/_next/static/chunks");
const cssName = fs.readdirSync(chunkDir).find((name) => name.endsWith(".css"));
const cssPath = cssName ? path.join(chunkDir, cssName) : "";
const mediaDir = path.join(root, "out/_next/static/media");
if (!fs.existsSync(cssPath)) {
  throw new Error("Built CSS missing. Run npm run build first.");
}

let css = fs.readFileSync(cssPath, "utf8");
css = css.replace(/url\(\.\.\/media\/([^)]+)\)/g, (_, file) => {
  const fontPath = path.join(mediaDir, file);
  const b64 = fs.readFileSync(fontPath).toString("base64");
  return `url("data:font/woff2;base64,${b64}")`;
});
css += `:root{--font-familjen:"Familjen Grotesk","Avenir Next","Segoe UI",sans-serif}`;

const photosDir = path.join(root, "public/photos");
const assets = {};
for (const name of fs.readdirSync(photosDir)) {
  if (!name.endsWith(".jpg")) continue;
  const b64 = fs.readFileSync(path.join(photosDir, name)).toString("base64");
  assets[`/photos/${name}`] = `data:image/jpeg;base64,${b64}`;
}

const landlordsDir = path.join(root, "public/landlords");
if (fs.existsSync(landlordsDir)) {
  for (const name of fs.readdirSync(landlordsDir)) {
    const ext = path.extname(name).slice(1).toLowerCase();
    const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : "";
    if (!mime) continue;
    const b64 = fs.readFileSync(path.join(landlordsDir, name)).toString("base64");
    assets[`/landlords/${name}`] = `data:${mime};base64,${b64}`;
  }
}

const jsResult = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["standalone/entry.tsx"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  minify: true,
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "aliases",
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          const base = path.join(root, args.path.slice(2));
          for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
            if (fs.existsSync(base + ext)) return { path: base + ext };
          }
          if (fs.existsSync(base)) return { path: base };
          return { path: base };
        });
        build.onResolve({ filter: /^next\/(link|navigation)$/ }, () => ({
          path: path.join(root, "standalone/router.tsx"),
        }));
      },
    },
  ],
});

const js = jsResult.outputFiles[0].text;
const assetScript = `window.__ASSETS=${JSON.stringify(assets)};`;

const html = `<!DOCTYPE html>
<html lang="sv" class="h-full antialiased">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#F3F0EA">
<title>Blixtbo</title>
<style>${css}</style>
</head>
<body class="min-h-full bg-paper font-sans text-ink">
<div id="root"></div>
<script>${assetScript}</script>
<script>${js}</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1);
console.log(`Wrote ${outFile} (${mb} MB)`);
