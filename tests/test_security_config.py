from __future__ import annotations

import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class SecurityConfigTests(unittest.TestCase):
    def test_firebase_database_rules_require_admin_for_writes(self) -> None:
        rules = json.loads((PROJECT_ROOT / "database.rules.json").read_text(encoding="utf-8"))
        root_rules = rules["rules"]
        rule_center = root_rules["rule_center"]

        self.assertFalse(root_rules[".read"])
        self.assertFalse(root_rules[".write"])
        self.assertEqual(rule_center[".read"], "auth != null")
        self.assertIn("root.child('admins').child(auth.uid).val() === true", rule_center[".write"])
        self.assertFalse(root_rules["admins"]["$uid"][".write"])

    def test_firebase_config_points_to_checked_in_rules(self) -> None:
        config = json.loads((PROJECT_ROOT / "firebase.json").read_text(encoding="utf-8"))
        self.assertEqual(config["database"]["rules"], "database.rules.json")

    def test_deployment_headers_contain_security_baseline(self) -> None:
        headers = (PROJECT_ROOT / "public" / "_headers").read_text(encoding="utf-8")

        self.assertIn("Content-Security-Policy:", headers)
        self.assertIn("frame-ancestors 'none'", headers)
        self.assertIn("object-src 'none'", headers)
        self.assertIn("X-Frame-Options: DENY", headers)
        self.assertIn("Strict-Transport-Security:", headers)

    def test_example_environment_values_have_no_trailing_commas(self) -> None:
        lines = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
        assignments = [line for line in lines if line and not line.startswith("#")]

        self.assertTrue(assignments)
        self.assertTrue(all(not line.rstrip().endswith(",") for line in assignments))


if __name__ == "__main__":
    unittest.main()
