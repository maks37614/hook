import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("vps_autodeploy", Path(__file__).parents[2] / "deploy/vps_autodeploy.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
GOOD = "a" * 40
NEWER = "b" * 40


class Runner:
    def __init__(self):
        self.calls = []
        self.conclusion = "success"
        self.ci_status = "completed"
        self.head_repo = "maks37614/hook"
        self.branch = "main"
        self.fetches = 0
        self.superseded = False
        self.fail_build = False
        self.fail_backup = False
        self.fail_start = False

    def __call__(self, args, *, cwd=None, env=None, timeout=120):
        self.calls.append((list(args), cwd, env))
        if args[:2] == ["git", "fetch"]:
            self.fetches += 1
        if args[:2] == ["git", "rev-parse"]:
            return NEWER if self.superseded and self.fetches > 1 else GOOD
        if args[:2] == ["gh", "api"] and "actions/workflows" in args[2]:
            return json.dumps({"workflow_runs": [{"id": 1, "head_sha": NEWER if self.superseded and self.fetches > 1 else GOOD,
                "head_branch": self.branch, "event": "push", "head_repository": {"full_name": self.head_repo},
                "status": self.ci_status, "conclusion": self.conclusion}]})
        if args[:3] == ["git", "worktree", "add"]:
            target = Path(args[4])
            (target / "deploy").mkdir(parents=True)
            for name in ["Dockerfile", "compose.yaml", "compose.vps.yaml", "deploy/vps_autodeploy.py"]:
                (target / name).write_text("fixture\n")
        if args[:2] == ["docker", "ps"]:
            return "previous-container"
        if args[:2] == ["docker", "inspect"]:
            return "hook2:previous"
        if args[:2] == ["docker", "cp"]:
            if self.fail_backup:
                raise RuntimeError("backup failed")
            (Path(args[-1]) / "alerts.json").write_text('[{"id":"existing-user-rule"}]')
        if args[:2] == ["docker", "compose"]:
            operation = args[8]
            if operation == "build" and self.fail_build:
                raise RuntimeError("build failed")
            if operation == "up" and self.fail_start and env["HOOK2_IMAGE"].startswith("hook2:vps-"):
                raise RuntimeError("new container failed")
        return ""


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.app = self.root / "app"
        self.app.mkdir()
        (self.app / ".env").write_text("DOMAIN=h00k.top\nTELEGRAM_BOT_TOKEN=fixture-only\n")
        (self.app / ".env").chmod(0o600)
        self.state = self.root / "state"
        self.state.mkdir()
        self.runner = Runner()
        self.deployer = module.Deployer(self.app, self.state, "https://h00k.top", run=self.runner, health=lambda *args: True)
        self.deployer.wait_health = lambda sha: None

    def tearDown(self):
        self.temporary.cleanup()

    def commands(self):
        return [args for args, _, _ in self.runner.calls]

    def test_ci_pending_or_failed_never_stops_or_builds_the_live_app(self):
        for status, conclusion in [("in_progress", None), ("completed", "failure")]:
            self.runner.ci_status, self.runner.conclusion = status, conclusion
            self.assertEqual(self.deployer.deploy_once(), "waiting")
        self.assertFalse(any(cmd[0] == "docker" for cmd in self.commands()))

    def test_fork_and_other_branch_success_cannot_deploy(self):
        self.runner.head_repo = "other/hook2"
        self.assertEqual(self.deployer.deploy_once(), "waiting")
        self.runner.head_repo = "maks37614/hook2"
        self.assertEqual(self.deployer.deploy_once(), "waiting")
        self.runner.head_repo, self.runner.branch = "maks37614/hook", "feature"
        self.assertEqual(self.deployer.deploy_once(), "waiting")

    def test_candidate_fetches_and_validates_the_current_repository(self):
        self.assertEqual(self.deployer.candidate(), GOOD)
        self.assertTrue(any(c[:4] == ["git", "fetch", "--no-tags", "https://github.com/maks37614/hook.git"]
                            for c in self.commands()))
        self.assertTrue(any(c[:2] == ["gh", "api"] and c[2].startswith("repos/maks37614/hook/actions/workflows/")
                            for c in self.commands()))

    def test_validated_release_builds_before_stop_and_backs_up_before_start(self):
        self.assertEqual(self.deployer.deploy_once(), "deployed")
        commands = self.commands()
        build = next(i for i, c in enumerate(commands) if c[:2] == ["docker", "compose"] and c[8] == "build")
        stop = next(i for i, c in enumerate(commands) if c[:2] == ["docker", "stop"])
        backup = next(i for i, c in enumerate(commands) if c[:2] == ["docker", "cp"])
        start = next(i for i, c in enumerate(commands) if c[:2] == ["docker", "compose"] and c[8] == "up")
        self.assertLess(build, stop)
        self.assertLess(stop, backup)
        self.assertLess(backup, start)
        saved = json.loads((self.state / "deployed.json").read_text())
        self.assertEqual(saved["sha"], GOOD)
        self.assertEqual((self.state / "releases" / GOOD / ".env").resolve(), self.app / ".env")
        self.assertEqual((self.app / ".env").read_text(), "DOMAIN=h00k.top\nTELEGRAM_BOT_TOKEN=fixture-only\n")
        backups = list((self.state / "backups").glob("*/alerts.json"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)
        self.assertFalse(any("down" in c or c[:3] == ["docker", "volume", "rm"] for c in commands))

    def test_build_failure_preserves_running_app_and_throttles_retries(self):
        self.runner.fail_build = True
        with self.assertRaisesRegex(RuntimeError, "build failed"):
            self.deployer.deploy_once()
        self.assertFalse(any(c[:2] == ["docker", "stop"] for c in self.commands()))
        self.assertEqual(self.deployer.deploy_once(), "backoff")
        (self.state / "retry.request").touch()
        with self.assertRaisesRegex(RuntimeError, "build failed"):
            self.deployer.deploy_once()

    def test_newer_push_during_build_cannot_be_overwritten_by_stale_release(self):
        self.runner.superseded = True
        self.assertEqual(self.deployer.deploy_once(), "superseded")
        self.assertFalse(any(c[:2] == ["docker", "stop"] for c in self.commands()))

    def test_backup_failure_restarts_previous_image_and_keeps_state_unchanged(self):
        self.runner.fail_backup = True
        with self.assertRaisesRegex(RuntimeError, "backup failed"):
            self.deployer.deploy_once()
        starts = [env["HOOK2_IMAGE"] for args, _, env in self.runner.calls if args[:2] == ["docker", "compose"] and args[8] == "up"]
        self.assertEqual(starts, ["hook2:previous"])
        self.assertFalse((self.state / "deployed.json").exists())
        self.assertEqual(list((self.state / "backups").iterdir()), [])

    def test_failed_container_rolls_back_without_restoring_over_live_data(self):
        self.runner.fail_start = True
        with self.assertRaisesRegex(RuntimeError, "new container failed"):
            self.deployer.deploy_once()
        starts = [env["HOOK2_IMAGE"] for args, _, env in self.runner.calls if args[:2] == ["docker", "compose"] and args[8] == "up"]
        self.assertEqual(starts, [f"hook2:vps-{GOOD}", "hook2:previous"])
        self.assertFalse(any(c[:2] == ["docker", "cp"] and not c[2].startswith("previous-container:") for c in self.commands()))
        self.assertFalse((self.state / "deployed.json").exists())

    def test_health_failure_rolls_back_and_does_not_publish_success(self):
        self.deployer.wait_health = lambda sha: (_ for _ in ()).throw(RuntimeError("health mismatch"))
        with self.assertRaisesRegex(RuntimeError, "health mismatch"):
            self.deployer.deploy_once()
        self.assertFalse(any("state=success" in c for c in self.commands()))
        self.assertTrue(any("state=failure" in c for c in self.commands()))

    def test_unchanged_healthy_commit_never_restarts_monitoring(self):
        module.atomic_write(self.state / "deployed.json", json.dumps({"sha": GOOD}))
        self.assertEqual(self.deployer.deploy_once(), "unchanged")
        self.assertFalse(any(c[0] == "docker" for c in self.commands()))

    def test_success_atomically_updates_agent_and_keeps_private_state(self):
        path = self.root / "agent.py"
        path.write_text("old")
        with patch.dict(os.environ, {"HOOK2_AGENT_FILE": str(path)}):
            self.assertEqual(self.deployer.deploy_once(), "deployed")
        self.assertEqual(path.read_text(), "fixture\n")
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.state / "deployed.json").stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
