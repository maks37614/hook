#!/usr/bin/env python3
"""Deploy a CI-approved main commit to one VPS; runtime data stays in Docker volumes."""
from __future__ import annotations

import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SHA = re.compile(r"^[a-f0-9]{40}$")


def command(args, *, cwd=None, env=None, timeout=120):
    result = subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        # No command argument contains the bot token or the contents of .env.
        raise RuntimeError(f"{args[0]} failed ({result.returncode}): {result.stderr[-2000:]}")
    return result.stdout.strip()


def atomic_write(path: Path, content: str):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def health_matches(origin: str, sha: str):
    try:
        with urllib.request.urlopen(origin.rstrip("/") + "/api/health", timeout=5) as response:
            data = json.load(response)
            return response.status == 200 and data.get("status") == "ok" and data.get("release") == sha
    except Exception:
        return False


class Deployer:
    def __init__(self, app_dir: Path, state_dir: Path, public_url: str, run=command, health=health_matches):
        self.app = app_dir.resolve()
        self.root = state_dir.resolve()
        self.url = public_url.rstrip("/")
        self.run = run
        self.health = health
        self.repo = "maks37614/hook2"
        self.branch = "main"
        self.state_file = self.root / "deployed.json"
        self.failure_file = self.root / "failed.json"
        self.env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        if not re.fullmatch(r"https://[a-zA-Z0-9.-]+", self.url):
            raise ValueError("HOOK2_PUBLIC_URL must be an HTTPS origin")

    def candidate(self):
        self.run(["git", "fetch", "--no-tags", f"https://github.com/{self.repo}.git",
                  "+refs/heads/main:refs/remotes/hook2-vps/main"], cwd=self.app, env=self.env)
        sha = self.run(["git", "rev-parse", "refs/remotes/hook2-vps/main"], cwd=self.app, env=self.env)
        if not SHA.fullmatch(sha):
            raise ValueError("Invalid Git commit")
        endpoint = f"repos/{self.repo}/actions/workflows/validate.yml/runs?branch=main&head_sha={sha}&event=push&per_page=5"
        runs = json.loads(self.run(["gh", "api", endpoint], env=self.env)).get("workflow_runs", [])
        matching = [r for r in runs if r.get("head_sha") == sha and r.get("head_branch") == self.branch
                    and r.get("event") == "push" and (r.get("head_repository") or {}).get("full_name", "").lower() == self.repo]
        latest = max(matching, key=lambda r: (r.get("id", 0), r.get("run_attempt", 1)), default=None)
        if not latest or latest.get("status") != "completed" or latest.get("conclusion") != "success":
            print(f"Waiting for successful Validate on main {sha[:12]}", flush=True)
            return None
        return sha

    def publish(self, sha, state, description):
        try:
            self.run(["gh", "api", f"repos/{self.repo}/statuses/{sha}", "--method", "POST",
                      "-f", f"state={state}", "-f", "context=hook2-vps", "-f", f"description={description}",
                      "-f", f"target_url={self.url}"], env=self.env)
        except Exception:
            print("Could not publish GitHub deployment status; see the service journal.", flush=True)

    def compose(self, directory, image, sha, *args):
        env = {**self.env, "HOOK2_IMAGE": image, "HOOK2_RELEASE_SHA": sha}
        return self.run(["docker", "compose", "-p", "hook2", "-f", "compose.yaml", "-f", "compose.vps.yaml", *args],
                        cwd=directory, env=env, timeout=1200 if args[0] == "build" else 240)

    def release(self, sha):
        target = self.root / "releases" / sha
        if not target.exists():
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            self.run(["git", "worktree", "add", "--detach", str(target), sha], cwd=self.app, env=self.env)
        else:
            existing = self.run(["git", "rev-parse", "HEAD"], cwd=target, env=self.env)
            if existing != sha:
                raise ValueError("Release directory contains another commit")
            self.run(["git", "diff", "--quiet"], cwd=target, env=self.env)
            self.run(["git", "diff", "--cached", "--quiet"], cwd=target, env=self.env)
        for name in ["Dockerfile", "compose.yaml", "compose.vps.yaml", "deploy/vps_autodeploy.py"]:
            if not (target / name).is_file():
                raise ValueError(f"Release is missing {name}")
        env_file = target / ".env"
        source = self.app / ".env"
        if env_file.is_symlink():
            if env_file.resolve() != source.resolve():
                raise ValueError("Release has an unexpected .env link")
        elif env_file.exists():
            raise ValueError("Release has a separate .env; resolve it before deployment")
        else:
            env_file.symlink_to(source)
        return target

    def previous(self, state):
        ids = self.run(["docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=hook2",
                        "--filter", "label=com.docker.compose.service=hook2"], env=self.env).split()
        if len(ids) > 1:
            raise ValueError("More than one hook2 container exists; refusing parallel monitoring")
        if not ids:
            return None
        image = self.run(["docker", "inspect", "--format", "{{.Config.Image}}", ids[0]], env=self.env)
        directory = Path(state.get("directory", str(self.app))).resolve()
        if directory != self.app and directory.parent != self.root / "releases":
            raise ValueError("Invalid previous release path")
        return {"container": ids[0], "image": image, "directory": str(directory), "sha": state.get("sha", "manual")}

    def backup(self, previous, sha):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        target = self.root / "backups" / f"{stamp}-{sha[:12]}"
        partial = target.with_name(target.name + ".partial")
        partial.mkdir(mode=0o700, parents=True)
        try:
            self.run(["docker", "cp", f"{previous['container']}:/data/.", str(partial)], env=self.env)
            for item in partial.rglob("*"):
                if item.is_symlink():
                    raise ValueError("Unexpected symlink in the data backup")
                item.chmod(0o700 if item.is_dir() else 0o600)
            os.replace(partial, target)
        except Exception:
            shutil.rmtree(partial)
            raise
        self.trim_backups()
        print(f"Data backup saved: {target}", flush=True)

    def wait_health(self, sha):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if self.health("http://127.0.0.1:3000", sha) and self.health(self.url, sha):
                return
            time.sleep(2)
        raise RuntimeError("Local or public HTTPS healthcheck did not report the expected commit")

    def cleanup(self, records):
        # Remove only our immutable, obsolete releases, never the user's checkout or Docker volumes.
        for record in records[3:]:
            sha = record.get("sha", "")
            if not SHA.fullmatch(sha):
                continue
            directory = (self.root / "releases" / sha).resolve()
            if str(directory) != record.get("directory"):
                continue
            try:
                self.run(["git", "worktree", "remove", str(directory)], cwd=self.app, env=self.env)
                self.run(["docker", "image", "rm", f"hook2:vps-{sha}"], env=self.env)
            except Exception:
                print(f"Cleanup deferred for {sha[:12]}", flush=True)
    def trim_backups(self):
        backups = sorted((self.root / "backups").glob("*-*"), reverse=True)
        for path in backups[10:]:
            if path.is_dir() and not path.is_symlink() and re.fullmatch(r"\d{8}T\d{12}Z-[a-f0-9]{12}", path.name):
                shutil.rmtree(path)

    def deploy_once(self):
        if not (self.app / ".env").is_file():
            raise ValueError("Create the private .env in the application checkout first")
        sha = self.candidate()
        if not sha:
            return "waiting"
        retry_request = self.root / "retry.request"
        requested = retry_request.exists()
        retry_request.unlink(missing_ok=True)
        failure = json.loads(self.failure_file.read_text()) if self.failure_file.exists() else {}
        if not requested and failure.get("sha") == sha and time.time() < failure.get("retryAt", 0):
            print(f"Deployment retry is delayed for {sha[:12]}; the previous release is preserved.", flush=True)
            return "backoff"
        state = json.loads(self.state_file.read_text()) if self.state_file.exists() else {}
        if state.get("sha") == sha and self.health("http://127.0.0.1:3000", sha):
            print(f"Already deployed {sha[:12]}", flush=True)
            return "unchanged"
        self.publish(sha, "pending", "Building and checking the VPS release")
        previous, stopped = None, False
        try:
            directory = self.release(sha)
            image = f"hook2:vps-{sha}"
            self.compose(directory, image, sha, "config", "--quiet")
            # Build while the previous worker is still serving users.
            self.compose(directory, image, sha, "build", "--pull", "hook2")
            # A newer push may have arrived during the build. Do not deploy stale code.
            if self.candidate() != sha:
                self.publish(sha, "error", "Superseded by a newer main commit")
                print("A newer main commit is waiting for validation; keeping the current release.", flush=True)
                return "superseded"
            previous = self.previous(state)
            if previous:
                self.run(["docker", "stop", "--time", "30", previous["container"]], env=self.env)
                stopped = True
                self.backup(previous, sha)
            self.compose(directory, image, sha, "up", "-d", "--no-build", "--wait", "--wait-timeout", "180")
            self.wait_health(sha)
            record = {"sha": sha, "directory": str(directory), "image": image}
            history = [record] + [r for r in state.get("history", []) if r.get("sha") != sha]
            agent = os.environ.get("HOOK2_AGENT_FILE")
            if agent:
                atomic_write(Path(agent), (directory / "deploy/vps_autodeploy.py").read_text())
            atomic_write(self.state_file, json.dumps({**record, "deployedAt": datetime.now(timezone.utc).isoformat(), "history": history[:3]}, indent=2))
            self.failure_file.unlink(missing_ok=True)
            self.publish(sha, "success", "VPS HTTPS healthcheck confirms this commit")
            try:
                self.cleanup(history)
            except Exception:
                print("Optional cleanup failed; the active release and data are intact.", flush=True)
            print(f"DEPLOYED {sha} {self.url}", flush=True)
            return "deployed"
        except Exception:
            attempts = failure.get("attempts", 0) + 1 if failure.get("sha") == sha else 1
            atomic_write(self.failure_file, json.dumps({"sha": sha, "attempts": attempts,
                         "retryAt": time.time() + min(3600, 300 * 2 ** min(attempts - 1, 4))}))
            if stopped and previous:
                print("Deployment failed; starting the previous image with the existing data volume.", flush=True)
                try:
                    self.compose(Path(previous["directory"]), previous["image"], previous["sha"],
                                 "up", "-d", "--no-build", "--wait", "--wait-timeout", "180")
                except Exception:
                    print("Previous image could not start; inspect the journal and preserved backup.", flush=True)
            self.publish(sha, "failure", "VPS deployment failed; inspect the service journal")
            raise


def main():
    app = Path(os.environ["HOOK2_APP_DIR"])
    root = Path(os.environ.get("HOOK2_STATE_DIR", str(Path.home() / ".local/state/hook2-vps")))
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (root / "deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        Deployer(app, root, os.environ.get("HOOK2_PUBLIC_URL", "https://h00k.top")).deploy_once()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"Deployment error: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
