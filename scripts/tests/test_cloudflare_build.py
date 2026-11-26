"""构建入口回归：模拟 Cloudflare 多版本 Python，不联网、不发布。"""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import textwrap
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "cloudflare-build.sh"


class CloudflareBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="bomkit-build-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.trace = self.root / "trace.jsonl"
        self.env = {**os.environ, "PATH": str(self.bin), "BUILD_TRACE": str(self.trace)}
        self.env.pop("BOMKIT_BUILD_PYTHON", None)
        self.env.pop("PYTHON_VERSION", None)

    def python(self, name, version=(3, 11), ensurepip=True, venv_ok=True, pip_ok=True):
        """替身区分版本、ensurepip、venv 创建和新环境 pip 四道检查。"""
        executable = self.bin / name
        # shell 跳板允许测试运行器位于带空格的 .build/python 路径。
        executable.write_text("#!/bin/sh\nexec " + shlex.quote(sys.executable)
                              + " - \"$@\" <<'PYTHON'\n" + textwrap.dedent(fr"""
            import json, os, pathlib, sys
            args = sys.argv[1:]
            with open(os.environ['BUILD_TRACE'], 'a') as f:
                f.write(json.dumps([{name!r}, *args]) + '\n')
            if args[0] == '-c':
                ok = {version!r} >= (3, 10)
                if 'ensurepip' in args[1]:
                    ok = ok and {ensurepip!r}
                sys.exit(0 if ok else 1)
            if args == ['--version']:
                print('Python {version[0]}.{version[1]}.0')
                sys.exit(0)
            if args[:2] == ['-m', 'venv']:
                if not {venv_ok!r}:
                    sys.exit(1)
                target = pathlib.Path(args[-1]) / 'bin' / 'python'
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('#!/bin/sh\nexit {0 if pip_ok else 1}\n')
                target.chmod(0o755)
                sys.exit(0)
            sys.exit(2)
        """) + "\nPYTHON\n")
        executable.chmod(0o755)
        return executable

    def run_function(self, name, *args):
        return subprocess.run(
            ["/bin/bash", "-c", 'source "$1"; shift; "$@"', "test", str(SCRIPT), name, *args],
            cwd=self.root, env=self.env, text=True, capture_output=True,
        )

    def prepared_with(self, name):
        result = self.run_function("prepare_build_python")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("使用Python: " + name + " (", result.stdout)
        return [json.loads(line) for line in self.trace.read_text().splitlines()]

    def test_prefers_platform_python_over_system_python312(self):
        self.python("python3")
        self.python("python3.12", version=(3, 12), ensurepip=False)
        calls = self.prepared_with("python3")
        self.assertNotIn("python3.12", [call[0] for call in calls])
        self.assertIn(["python3", "-m", "venv", "--clear", ".build/python"], calls)

    def test_skips_system_python_without_ensurepip(self):
        self.python("python3", version=(3, 12), ensurepip=False)
        self.python("python")
        calls = self.prepared_with("python")
        self.assertFalse(any(call[:3] == ["python3", "-m", "venv"] for call in calls))

    def test_skips_old_python_and_uses_configured_minor_fallback(self):
        self.python("python3", version=(3, 9))
        self.python("python3.11")
        self.python("python3.14", version=(3, 14))
        self.env["PYTHON_VERSION"] = "3.14.1"
        self.prepared_with("python3.14")

    def test_falls_back_to_python311_when_generic_commands_missing(self):
        self.python("python3.11")
        self.python("python3.12", version=(3, 12), ensurepip=False)
        self.prepared_with("python3.11")

    def test_retries_when_venv_module_imports_but_creation_fails(self):
        self.python("python3", venv_ok=False)
        self.python("python")
        self.prepared_with("python")

    def test_retries_when_new_venv_has_no_working_pip(self):
        self.python("python3", pip_ok=False)
        self.python("python")
        self.prepared_with("python")

    def test_explicit_override_takes_precedence(self):
        requested = self.python("chosen-python", version=(3, 12))
        self.python("python3")
        self.env["BOMKIT_BUILD_PYTHON"] = str(requested)
        calls = self.prepared_with(str(requested))
        self.assertEqual({call[0] for call in calls}, {"chosen-python"})

    def test_invalid_override_does_not_silently_fall_back(self):
        self.python("python3")
        self.python("broken-python", ensurepip=False)
        for override in ["missing-python", "broken-python"]:
            with self.subTest(override=override):
                self.env["BOMKIT_BUILD_PYTHON"] = override
                result = self.run_function("prepare_build_python")
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("使用Python:", result.stdout)
                self.assertIn("未找到可用", result.stderr)

    def test_fails_when_no_suitable_python_exists(self):
        self.python("python3", version=(3, 9))
        result = self.run_function("prepare_build_python")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("未找到可用", result.stderr)

    def test_blocks_private_files_and_spreadsheet_archives(self):
        self.env["PATH"] = "/usr/bin:/bin"
        for filename in ["sample.xlsx", "sample.xls", "SAMPLE.XLSX", "sample.rar",
                         "sample.RAR", "private/data.json", "nested/PRIVATE/data.txt"]:
            with self.subTest(filename=filename):
                asset = self.root / "dist" / filename
                asset.parent.mkdir(parents=True, exist_ok=True)
                asset.touch()
                result = self.run_function("check_public_assets", str(self.root / "dist"))
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("拒绝发布", result.stderr)
                self.assertNotIn(filename, result.stderr)
                asset.unlink()

    def test_allows_public_runtime_assets(self):
        self.env["PATH"] = "/usr/bin:/bin"
        for filename in ["index.html", "_headers", "pyodide/bomcore.whl",
                         "pyodide/python_stdlib.zip", "pyodide/pyodide.asm.wasm"]:
            asset = self.root / "dist" / filename
            asset.parent.mkdir(parents=True, exist_ok=True)
            asset.touch()
        result = self.run_function("check_public_assets", str(self.root / "dist"))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_missing_asset_directory(self):
        result = self.run_function("check_public_assets", str(self.root / "missing"))
        self.assertNotEqual(result.returncode, 0)

    def test_ignores_private_in_parent_path_outside_published_directory(self):
        self.env["PATH"] = "/usr/bin:/bin"
        assets = self.root / "private" / "build" / "dist"
        assets.mkdir(parents=True)
        (assets / "index.html").touch()
        result = self.run_function("check_public_assets", str(assets))
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
