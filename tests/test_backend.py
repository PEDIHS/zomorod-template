"""Regression tests for pure backend contracts; no live database or credentials."""
import ast
import inspect
import os
import posixpath
import re
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]

def functions(file, names, namespace):
    tree = ast.parse((ROOT / file).read_text())
    selected = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
    for node in selected:
        node.decorator_list = []
        node.returns = None
        for arg in [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]:
            arg.annotation = None
    exec(compile(ast.Module(body=selected, type_ignores=[]), file, 'exec'), namespace)
    return namespace

class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.scope = '/custom-sub/'
        self.ns = functions('backend/zomorod_pwa.py', {'_safe_manifest_start'}, {'SUB_SCOPE': self.scope, 'posixpath': posixpath, 'unquote': unquote})
    def test_preserves_namespaced_subscription(self):
        path = '/custom-sub/admin/user-token'
        self.assertEqual(self.ns['_safe_manifest_start'](path), path)
    def test_rejects_escape_and_unsafe_launch_paths(self):
        for value in ['https://evil.com', '//evil.com', '/sub/token', '/custom-sub/../api', '/custom-sub/%2e%2e/api', '/custom-sub/%5cevil.com', '/custom-sub/token?secret=a', '/custom-sub/token#x', '/custom-sub/%00token']:
            with self.subTest(value=value): self.assertEqual(self.ns['_safe_manifest_start'](value), self.scope)

class BrandingTests(unittest.TestCase):
    def setUp(self):
        self.ns = functions('backend/zomorod_admin_subscriptions.py', {'_overlay_headers', '_overlay_response'}, {
            '_has_profile_overrides': lambda admin: True,
            '_has_theme_overrides': lambda admin: False,
            '_profile_from_admin': lambda admin: {'store_name': 'reseller', 'support_url': ''},
            '_profile_headers': lambda admin: {'x-zomorod-store-name-b64': 'cmVzZWxsZXI='},
            'encode_title': lambda text: text,
        })
    def test_empty_reseller_support_does_not_inherit_owner_contact(self):
        headers = self.ns['_overlay_headers']({'support-url': 'https://owner.example', 'native': 'preserved'}, object())
        self.assertNotIn('support-url', headers)
        self.assertEqual(headers['native'], 'preserved')
    def test_response_overlay_removes_stale_native_support(self):
        response = types.SimpleNamespace(headers={'support-url': 'https://owner.example'})
        self.assertNotIn('support-url', self.ns['_overlay_response'](response, object()).headers)
    def test_no_profile_override_preserves_native_branding(self):
        self.ns['_has_profile_overrides'] = lambda admin: False
        headers = {'support-url': 'https://native.example'}
        self.assertEqual(self.ns['_overlay_headers'](headers, object()), headers)

class CompatibilityTests(unittest.TestCase):
    def report(self, operation):
        version = types.ModuleType('app.version'); version.__version__ = '5.6.0'
        ns = functions('backend/zomorod_admin_subscriptions.py', {'_compatibility_report'}, {'SubscriptionOperation': operation, 'inspect': inspect})
        with patch.dict(sys.modules, {'app.version': version}): return ns['_compatibility_report']()
    def test_missing_contracts_are_not_reported_as_compatible(self):
        self.assertFalse(self.report(object)['contracts_ok'])
    @unittest.skipUnless(os.getenv('PASARGUARD_SOURCE'), 'Set PASARGUARD_SOURCE to the official v5.6.0 checkout')
    def test_official_pasarguard_560_operation_contracts(self):
        source = Path(os.environ['PASARGUARD_SOURCE'])
        version = (source / 'app/version.py').read_text()
        self.assertIn('5.6.0', version)
        native = (source / 'app/operation/subscription.py').read_text()
        # Python 3.14 permits unparenthesized multi-exception clauses. The local
        # 3.12 parser only inspects signatures, so normalize that spelling here.
        native = re.sub(r'(?m)^(\s*except) ([A-Za-z_][\w.]*(?:,\s*[A-Za-z_][\w.]*)+)(\s+as\s+\w+)?:', r'\1 (\2)\3:', native)
        tree = ast.parse(native)
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'SubscriptionOperation')
        operation = type('Contract', (), {})
        for node in cls.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                def stub(): pass
                parameters = [inspect.Parameter(a.arg, inspect.Parameter.POSITIONAL_OR_KEYWORD) for a in node.args.args]
                parameters += [inspect.Parameter(a.arg, inspect.Parameter.KEYWORD_ONLY, default=None) for a in node.args.kwonlyargs]
                stub.__signature__ = inspect.Signature(parameters)
                setattr(operation, node.name, stub)
        report = self.report(operation)
        self.assertTrue(report['contracts_ok'], report['checks'])
        self.assertEqual(report['tested_panel_version'], '5.6.0')

if __name__ == '__main__': unittest.main()
