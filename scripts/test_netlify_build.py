import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("netlify_build", Path(__file__).with_name("check-netlify-build.py"))
netlify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(netlify)


class NetlifyBuildTests(unittest.TestCase):
    def setUp(self):
        temporary_root = Path(__file__).resolve().parents[1] / "local-only" / "netlify-check-tests"
        temporary_root.mkdir(parents=True, exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=temporary_root)
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.base = self.root / "web"
        self.base.mkdir()
        self.config = '[build]\nbase="web"\ncommand="npm run generate"\npublish="site-files"\n[build.environment]\nNODE_VERSION="24"\nNITRO_PRESET="static"\nNUXT_PUBLIC_API_BASE=""\n'
        self.write_config(self.config)

    def write_config(self, text):
        (self.root / "netlify.toml").write_text(text)

    def output(self, directory):
        directory.mkdir(parents=True)
        for name in ("index.html", "200.html", "_nuxt/app.js", "_nuxt/app.css"):
            path = directory / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("synthetic build output")

    def test_uses_configured_base_command_environment_and_publish(self):
        self.write_config(self.config + '\n[context.production.environment]\nNODE_VERSION="26"\n')
        def run(command, **options):
            self.assertEqual(options["cwd"], self.base)
            self.assertEqual(options["env"]["NETLIFY"], "true")
            self.assertEqual(options["env"]["CI"], "true")
            self.assertEqual(options["env"]["NITRO_PRESET"], "static")
            self.assertEqual(options["env"]["NODE_VERSION"], "26")
            self.assertEqual(options["env"]["NUXT_PUBLIC_API_BASE"], "")
            if command[0] == "sh":
                self.assertEqual(command, ["sh", "-c", "npm run generate"])
                self.output(self.base / "site-files")
        with patch.object(netlify.subprocess, "run", side_effect=run) as runner:
            netlify.check_build(self.root)
        self.assertEqual(runner.call_count, 2)

    def test_missing_preset_and_dist_output_cannot_pass(self):
        self.write_config(self.config.replace('NITRO_PRESET="static"\n', ''))
        def run(command, **options):
            self.assertNotIn("NITRO_PRESET", options["env"])
            self.assertNotIn("SERVER_PRESET", options["env"])
            if command[0] == "sh":
                self.output(self.base / "dist")
        with patch.dict(os.environ, {"NITRO_PRESET": "static", "SERVER_PRESET": "static"}):
            with patch.object(netlify.subprocess, "run", side_effect=run):
                with self.assertRaisesRegex(ValueError, "missing or empty: index.html"):
                    netlify.check_build(self.root)

    def test_stale_output_is_rejected_without_deletion_or_running_commands(self):
        self.output(self.base / "site-files")
        with patch.object(netlify.subprocess, "run") as runner:
            with self.assertRaisesRegex(ValueError, "already exists"):
                netlify.check_build(self.root)
        runner.assert_not_called()
        self.assertTrue((self.base / "site-files/index.html").is_file())

    def test_failed_generation_is_not_reported_as_success(self):
        with patch.object(netlify.subprocess, "run", side_effect=[None, subprocess.CalledProcessError(2, "generate")]):
            with self.assertRaises(subprocess.CalledProcessError):
                netlify.check_build(self.root)

    def test_dangling_publish_link_is_rejected_without_deletion(self):
        publish = self.base / "site-files"
        publish.symlink_to(self.base / "missing-output", target_is_directory=True)
        with patch.object(netlify.subprocess, "run") as runner:
            with self.assertRaisesRegex(ValueError, "already exists"):
                netlify.check_build(self.root)
        runner.assert_not_called()
        self.assertTrue(publish.is_symlink())

    def test_empty_html_and_missing_assets_are_rejected(self):
        output = self.base / "site-files"
        self.output(output)
        (output / "index.html").write_text("")
        with self.assertRaisesRegex(ValueError, "index.html"):
            netlify.verify_output(self.base, output)
        (output / "index.html").write_text("synthetic HTML")
        (output / "_nuxt/app.css").unlink()
        with self.assertRaisesRegex(ValueError, "css assets"):
            netlify.verify_output(self.base, output)

    def test_existing_routing_files_must_be_preserved(self):
        output = self.base / "site-files"
        self.output(output)
        (self.base / "public").mkdir()
        for name in ("_headers", "_redirects"):
            (self.base / "public" / name).write_text("synthetic routing rules")
            with self.assertRaisesRegex(ValueError, name):
                netlify.verify_output(self.base, output)
            (output / name).write_text("synthetic routing rules")
        netlify.verify_output(self.base, output)


if __name__ == "__main__":
    unittest.main()
