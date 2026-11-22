// Vite build for the Samsung TV (Tizen) web app.
//
// Samsung TVs from 2018 (Tizen 4.0) ship Chromium 56, which has no ES modules,
// no CSS grid and no flexbox `gap`. So the bundle is a single classic script
// (IIFE) transpiled for chrome56, and the CSS avoids those features.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

const ROOT = __dirname;
const REPO = path.resolve(ROOT, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));

// Tizen wants a plain x.y.z version
const appVersion = (pkg.version.match(/^\d+\.\d+\.\d+/) || ["1.0.0"])[0];

function tizenPackage() {
  return {
    name: "streambert-tizen-package",
    apply: "build",
    // classic <script defer> instead of <script type="module" crossorigin>
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return html
          .replace(/<script type="module" crossorigin/g, "<script defer")
          .replace(/<script type="module"/g, "<script defer")
          .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"')
          .replace(/<link rel="modulepreload"[^>]*>/g, "");
      },
    },
    generateBundle() {
      const config = fs
        .readFileSync(path.join(ROOT, "config.xml"), "utf8")
        .split("__VERSION__").join(appVersion);
      this.emitFile({ type: "asset", fileName: "config.xml", source: config });
      this.emitFile({
        type: "asset",
        fileName: "icon.png",
        source: fs.readFileSync(path.join(REPO, "public", "icon.png")),
      });
    },
  };
}

export default defineConfig({
  root: ROOT,
  base: "./",
  envDir: ROOT,
  publicDir: false,
  plugins: [react(), tizenPackage()],
  resolve: {
    alias: {
      "@shared": path.join(REPO, "src", "utils"),
      "@components": path.join(REPO, "src", "components"),
    },
  },
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: { port: 5174 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome56",
    cssTarget: "chrome56",
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/app.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
