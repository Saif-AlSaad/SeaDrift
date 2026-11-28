import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEXT_EXTS = new Set([".ts", ".tsx", ".js", ".css", ".html", ".json", ".svg", ".webmanifest"]);
const PUBLIC_BASE_URL = "https://saif-alsaad.github.io/SeaDrift";

/** Compute a deterministic cross-platform hash over app inputs so CI web & APK builds match. */
function computeBuildHash(rootDir: string): string {
  const hash = crypto.createHash("sha256");

  const addFile = (absPath: string) => {
    const rel = path.relative(rootDir, absPath).replace(/\\/g, "/");
    hash.update(rel + "\n");
    const raw = fs.readFileSync(absPath);
    if (TEXT_EXTS.has(path.extname(absPath).toLowerCase())) {
      hash.update(raw.toString("utf8").replace(/\r\n/g, "\n"));
    } else {
      hash.update(raw);
    }
    hash.update("\n");
  };

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) addFile(full);
    }
  };

  walk(path.join(rootDir, "src"));
  walk(path.join(rootDir, "public"));
  for (const file of ["index.html", "package.json"]) {
    const full = path.join(rootDir, file);
    if (fs.existsSync(full)) addFile(full);
  }

  return hash.digest("hex").slice(0, 12);
}

function versionManifestPlugin(buildHash: string): Plugin {
  let outDir = path.resolve(__dirname, "dist");
  return {
    name: "seadrift-version-manifest",
    configResolved(cfg) {
      outDir = path.resolve(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      const manifest = {
        version: buildHash,
        bundleUrl: `${PUBLIC_BASE_URL}/index.html`,
        builtAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(outDir, "version.json"), JSON.stringify(manifest, null, 2));
    },
  };
}

const buildHash = computeBuildHash(__dirname);

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  define: {
    __SEADRIFT_BUILD_HASH__: JSON.stringify(buildHash),
  },
  plugins: [react(), tailwindcss(), viteSingleFile(), versionManifestPlugin(buildHash)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
