#!/usr/bin/env bash
# GitHub -> Cloudflare Pages：从源码构建Python核心与运行时，产出web/dist静态文件。
set -euo pipefail
cd "$(dirname "$0")/.."

requested_python="$(printenv BOMKIT_BUILD_PYTHON 2>/dev/null || true)"
python_bin=""
for candidate in "$requested_python" python3.12 python3.11 python3.10 python3 python; do
  [ -n "$candidate" ] || continue
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; raise SystemExit(sys.version_info < (3, 10))' 2>/dev/null; then
    python_bin="$candidate"
    break
  fi
done
if [ -z "$python_bin" ]; then
  echo "构建需要Python>=3.10；请在Cloudflare Pages环境变量设置PYTHON_VERSION=3.11或指定BOMKIT_BUILD_PYTHON。" >&2
  exit 1
fi

echo "使用Python: $python_bin ($("$python_bin" --version))"
"$python_bin" -m venv .build/python
build_python=.build/python/bin/python

echo "安装构建依赖并打包core wheel..."
"$build_python" -m pip install --disable-pip-version-check --no-input -r core/requirements-build.txt
"$build_python" -m build --wheel --no-isolation core

echo "准备前端依赖与Pyodide运行时..."
npm --prefix web ci --include=dev
npm --prefix web run prepare:pyodide

echo "打包前端静态文件..."
npm --prefix web run build

if find web/dist -type f | grep -E '(/private/|\.xlsx?\$|\.rar\$)' >/dev/null; then
  echo "拒绝发布：静态产物中出现私有资料路径或表格文件。" >&2
  exit 1
fi
echo "Cloudflare Pages 构建完成！输出目录: web/dist"
