#!/usr/bin/env node
/**
 * 构建脚本：把 Pyodide runtime + openpyxl/et_xmlfile/micropip/packaging wheel +
 * 本仓库 core/ 构建出的 bomcore wheel，全部复制到 web/public/pyodide/ 下自托管。
 * 见 docs/04-agent-tasks.md T4 任务 2；docs/01-architecture.md D1（纯前端本地处理，
 * 无后端）要求这些资源必须能离线自托管，不依赖运行时访问 CDN。
 *
 * 用法：node scripts/prepare-pyodide.mjs
 * 前置条件：
 *   - `npm install`（拉取 node_modules/pyodide runtime 文件）
 *   - `pip install -e core/ && python -m build --wheel` 于 core/ 目录下
 *     生成 core/dist/bomcore-*.whl（本脚本会自动查找并复制最新一份）。
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import https from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..");
const targetDir = path.join(webRoot, "public", "pyodide");
const pyodidePkgDir = path.join(webRoot, "node_modules", "pyodide");
const coreDistDir = path.join(repoRoot, "core", "dist");

// Pyodide 版本锁定于 web/package.json 的 "pyodide" 依赖版本（当前 0.26.4）。
// 升级 Pyodide 版本前必须重新核对下面这些第三方 wheel 是否仍与其 ABI 兼容
// （et_xmlfile/openpyxl 是纯 Python wheel，通常不受影响；micropip/packaging
// 版本需与目标 Pyodide 版本的 pyodide-lock.json 保持一致，见下方常量注释）。
const PYODIDE_RUNTIME_FILES = [
  "pyodide.mjs",
  "pyodide.mjs.map",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
  "pyodide.d.ts",
  "package.json",
];

// micropip/packaging 版本需与 node_modules/pyodide/pyodide-lock.json 里的记录一致
// （这两个包不随 npm 包分发二进制 wheel，需从 Pyodide CDN 单独下载一次固化到本地）。
const MICROPIP_WHEEL = { name: "micropip-0.6.0-py3-none-any.whl", cdnPath: "micropip-0.6.0-py3-none-any.whl" };
const PACKAGING_WHEEL = { name: "packaging-23.2-py3-none-any.whl", cdnPath: "packaging-23.2-py3-none-any.whl" };

// openpyxl 及其唯一依赖 et_xmlfile 不在 Pyodide 内置包索引里，走 PyPI 官方 wheel。
const OPENPYXL_WHEEL = {
  name: "openpyxl-3.1.5-py2.py3-none-any.whl",
  url: "https://files.pythonhosted.org/packages/c0/da/977ded879c29cbd04de313843e76868e6e13408a94ed6b987245dc7c8506/openpyxl-3.1.5-py2.py3-none-any.whl",
};
const ET_XMLFILE_WHEEL = {
  name: "et_xmlfile-2.0.0-py3-none-any.whl",
  url: "https://files.pythonhosted.org/packages/c1/8b/5fe2cc11fee489817272089c4203e679c63b570a5aaeb18d852ae3cbba6a/et_xmlfile-2.0.0-py3-none-any.whl",
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`下载失败 ${url}: HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          import("node:fs").then(({ writeFileSync }) => {
            writeFileSync(dest, Buffer.concat(chunks));
            resolve();
          });
        });
      })
      .on("error", reject);
  });
}

function findLatestWheel(dir, prefix) {
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".whl"))
    .map((f) => ({ f, mtime: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates.length ? candidates[0].f : null;
}

async function main() {
  mkdirSync(targetDir, { recursive: true });

  // 1) Pyodide runtime 文件（来自 npm 安装的 pyodide 包，与 web/package.json 版本一致）。
  if (!existsSync(pyodidePkgDir)) {
    throw new Error(`未找到 node_modules/pyodide，先运行 npm install（目录: ${pyodidePkgDir}）`);
  }
  for (const file of PYODIDE_RUNTIME_FILES) {
    const src = path.join(pyodidePkgDir, file);
    if (!existsSync(src)) {
      console.warn(`跳过缺失文件: ${file}`);
      continue;
    }
    copyFileSync(src, path.join(targetDir, file));
    console.log(`已复制 ${file}`);
  }

  // 2) bomcore wheel：从 core/dist/ 找最新构建产物。
  const bomcoreWheel = findLatestWheel(coreDistDir, "bomcore-");
  if (!bomcoreWheel) {
    throw new Error(
      `未找到 core/dist/bomcore-*.whl，请先在 core/ 目录运行: python -m build --wheel`
    );
  }
  copyFileSync(path.join(coreDistDir, bomcoreWheel), path.join(targetDir, bomcoreWheel));
  console.log(`已复制 ${bomcoreWheel}`);

  // 3) 第三方依赖 wheel：本地已存在则跳过下载（避免重复联网）。
  const cdnBase = `https://cdn.jsdelivr.net/pyodide/v0.26.4/full/`;
  const toFetch = [
    { name: MICROPIP_WHEEL.name, url: cdnBase + MICROPIP_WHEEL.cdnPath },
    { name: PACKAGING_WHEEL.name, url: cdnBase + PACKAGING_WHEEL.cdnPath },
    { name: OPENPYXL_WHEEL.name, url: OPENPYXL_WHEEL.url },
    { name: ET_XMLFILE_WHEEL.name, url: ET_XMLFILE_WHEEL.url },
  ];
  for (const { name, url } of toFetch) {
    const dest = path.join(targetDir, name);
    if (existsSync(dest)) {
      console.log(`已存在，跳过下载: ${name}`);
      continue;
    }
    console.log(`下载 ${name} ...`);
    await download(url, dest);
    console.log(`已下载 ${name}`);
  }

  console.log("\n完成。web/public/pyodide/ 内容：");
  for (const f of readdirSync(targetDir).sort()) {
    console.log(" -", f);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
