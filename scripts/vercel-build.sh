#!/usr/bin/env bash
# GitHub -> Vercel：始终从源码构建Python核心与运行时，不依赖本机未跟踪文件。
set -euo pipefail
cd "$(dirname "$0")/.."
requested_python="$(printenv BOMKIT_BUILD_PYTHON 2>/dev/null || true)"
python_bin=""
for candidate in "$requested_python" python3.12 python3.13 python3.14 python3 python; do
  [ -n "$candidate" ] || continue
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; raise SystemExit(sys.version_info < (3, 10))' 2>/dev/null; then
    python_bin="$candidate"
    break
  fi
done
if [ -z "$python_bin" ]; then
  echo "构建需要Python>=3.10；请使用当前Vercel构建镜像或指定BOMKIT_BUILD_PYTHON。" >&2
  exit 1
fi
"$python_bin" -m venv .vercel-build/python
build_python=.vercel-build/python/bin/python
"$build_python" -m pip install --disable-pip-version-check --no-input -r core/requirements-build.txt
"$build_python" -m build --wheel --no-isolation core
npm --prefix web run prepare:pyodide
npm --prefix web run build
# 只发布静态文件，不创建Python函数；拒绝资料文件进入发布目录。
if find web/dist -type f | grep -E '(/private/|\.xlsx?$|\.rar$)' >/dev/null; then
  echo "拒绝发布：静态产物中出现私有资料路径或表格文件。" >&2
  exit 1
fi
