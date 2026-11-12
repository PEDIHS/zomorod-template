"""Regression tests for Zomorod dashboard loader persistence after updates/restarts."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

SCRIPT = (Path(__file__).resolve().parents[1] / "plugin/integrate-dashboard.sh").read_text(encoding="utf-8")
LOADER_PROGRAMS = re.findall(r"inject_admin_loader(?:_container)?\(\) \{.*?<<'PY'\n(.*?)\nPY", SCRIPT, re.S)


class DashboardLoaderTests(unittest.TestCase):
    def test_host_and_container_loader_idempotence(self):
        self.assertEqual(len(LOADER_PROGRAMS), 2)
        for index, program in enumerate(LOADER_PROGRAMS):
            with self.subTest(loader=index), tempfile.TemporaryDirectory() as directory:
                html = Path(directory) / "index.html"
                html.write_text(
                    '<!doctype html><html><body><div id="app"></div>\n'
                    '<script id="zomorod-special-loader" src="/statics/zomorod-special.js?v=old" defer></script>\n'
                    '<script data-test="keep">window.keep = true;</script>\n'
                    '<script id="zomorod-special-loader" src="/statics/zomorod-special.js?v=stale" defer></script>\n'
                    '</body></html>\n', encoding="utf-8"
                )
                def reconcile():
                    subprocess.run(
                        [sys.executable, "-c", program, str(html), "zomorod-special-loader", "newhash"],
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    return html.read_text(encoding="utf-8")
                first = reconcile()
                self.assertEqual(first.count('id="zomorod-special-loader"'), 1)
                self.assertEqual(first.count('src="/statics/zomorod-special.js?v=newhash"'), 1)
                self.assertIn('data-test="keep"', first)
                self.assertIn('<div id="app"></div>', first)
                self.assertEqual(first, reconcile(), "reconciliation must be byte-for-byte idempotent")

    def test_versioned_loader_replaces_legacy_inline(self):
        for program in LOADER_PROGRAMS:
            with tempfile.TemporaryDirectory() as directory:
                html = Path(directory) / "404.html"
                html.write_text('<body><script id="zomorod-special-loader"></script></body>', encoding="utf-8")
                subprocess.run(
                    [sys.executable, "-c", program, str(html), "zomorod-special-loader", "patch"],
                    check=True,
                )
                self.assertIn('src="/statics/zomorod-special.js?v=patch"', html.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
