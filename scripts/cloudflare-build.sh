#!/usr/bin/env bash
# GitHub -> Cloudflare Workers：从源码构建Python核心与运行时，产出web/dist静态文件。
set -euo pipefail

prepare_build_python() {
  local candidate
  local candidates=()
  if [ -n "${BOMKIT_BUILD_PYTHON:-}" ]; then
    # 显式覆盖必须生效；无效时失败，不偷偷换用其他解释器。
    candidates=("$BOMKIT_BUILD_PYTHON")
  else
    # 优先使用平台版本管理器放在 PATH 中的解释器，而不是抢选系统 3.12。
    candidates=(python3 python)
    if [[ "${PYTHON_VERSION:-}" =~ ^([0-9]+)\.([0-9]+) ]]; then
      candidates+=("python${BASH_REMATCH[1]}.${BASH_REMATCH[2]}")
    fi
    candidates+=(python3.11 python3.12 python3.13 python3.14 python3.10)
  fi

  build_python=.build/python/bin/python
  for candidate in "${candidates[@]}"; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    if ! "$candidate" -c 'import sys; sys.exit(1) if sys.version_info < (3, 10) else None; import venv, ensurepip' 2>/dev/null; then
      echo "跳过 ${candidate}：需要 Python>=3.10 且包含 venv/ensurepip。" >&2
      continue
    fi
    # 仅能 import 还不够：实际创建带 pip 的环境，并清除上一次失败留下的环境。
    if "$candidate" -m venv --clear .build/python && "$build_python" -m pip --version >/dev/null 2>&1; then
      echo "使用Python: $candidate ($("$candidate" --version))"
      return 0
    fi
    echo "跳过 ${candidate}：无法创建带 pip 的构建环境。" >&2
  done
  echo "未找到可用的 Python>=3.10 构建环境；请检查 PYTHON_VERSION 或 BOMKIT_BUILD_PYTHON。" >&2
  return 1
}

check_public_assets() {
  local assets_dir="$1"
  local unsafe_asset
  if [ ! -d "$assets_dir" ]; then
    echo "拒绝发布：静态产物目录不存在。" >&2
    return 1
  fi
  # 不输出文件名，避免私有资料名称进入构建日志；stdlib.zip 是必需的公开运行时。
  if ! unsafe_asset="$(cd "$assets_dir" && find . -type f \( -ipath '*/private/*' -o -iname '*.xls' -o -iname '*.xlsx' -o -iname '*.rar' \) -print -quit)"; then
    echo "拒绝发布：无法检查静态产物。" >&2
    return 1
  fi
  if [ -n "$unsafe_asset" ]; then
    echo "拒绝发布：静态产物中出现私有资料路径、表格或资料压缩包。" >&2
    return 1
  fi
}

main() {
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  prepare_build_python

  echo "安装构建依赖并打包core wheel..."
  "$build_python" -m pip install --disable-pip-version-check --no-input -r core/requirements-build.txt
  "$build_python" -m build --wheel --no-isolation core

  echo "准备前端依赖与Pyodide运行时..."
  npm --prefix web ci --include=dev
  npm --prefix web run prepare:pyodide

  echo "打包前端静态文件..."
  npm --prefix web run build
  check_public_assets web/dist
  echo "Cloudflare Workers 构建完成！输出目录: web/dist"
}

# 允许回归测试只加载函数，不安装依赖、不联网、不发布。
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
