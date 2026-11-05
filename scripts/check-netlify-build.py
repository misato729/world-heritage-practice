"""Generate and verify a static site using the production netlify.toml settings."""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import tomllib


def load_build(root):
    with (root / "netlify.toml").open("rb") as source:
        config = tomllib.load(source)
    defaults = config["build"]
    production = config.get("context", {}).get("production", {})
    build = defaults | production
    environment = defaults.get("environment", {}) | production.get("environment", {})
    if not all(isinstance(value, str) for value in environment.values()):
        raise ValueError("Netlify build environment values must be strings")
    base = (root / build["base"]).resolve()
    publish = base / build["publish"]
    resolved_publish = publish.resolve()
    if not base.is_relative_to(root.resolve()) or not resolved_publish.is_relative_to(base) or resolved_publish == base:
        raise ValueError("Netlify base/publish must stay inside the project")
    return base, publish, build["command"], environment


def build_environment(configured):
    # A caller's preset must not hide its removal from netlify.toml.
    environment = {
        key: value for key, value in os.environ.items()
        if not key.startswith(("NITRO_", "NUXT_")) and key != "SERVER_PRESET"
    }
    environment.update(configured)
    environment.update(NETLIFY="true", CI="true", CONTEXT="production")
    return environment


def verify_output(base, publish):
    for name in ("index.html", "200.html"):
        path = publish / name
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"Netlify publish output is missing or empty: {name}")
    for extension in ("js", "css"):
        if not any(path.is_file() and path.stat().st_size for path in (publish / "_nuxt").rglob(f"*.{extension}")):
            raise ValueError(f"Netlify publish output has no nonempty {extension} assets")
    # Preserve service-specific routing files without copying deployment targets
    # into templates that do not yet define them.
    for name in ("_headers", "_redirects"):
        source = base / "public" / name
        if source.is_file():
            target = publish / name
            if not target.is_file() or not target.stat().st_size or target.read_bytes() != source.read_bytes():
                raise ValueError(f"Netlify publish output does not preserve {name}")


def check_build(root):
    base, publish, command, configured = load_build(root)
    # Fail rather than deleting a user's output. CI uses a fresh checkout, so
    # output from an earlier node-server build can never make this check pass.
    if publish.exists() or publish.is_symlink():
        raise ValueError("Netlify publish directory already exists; use a clean checkout")
    environment = build_environment(configured)
    subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=base, env=environment, check=True)
    print("Generating with the production netlify.toml settings (NETLIFY=true)", flush=True)
    subprocess.run(["sh", "-c", command], cwd=base, env=environment, check=True)
    verify_output(base, publish)
    print("Netlify publish directory verified: HTML, JS/CSS and configured routing files")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node-version", action="store_true", help="Print the configured Node version for setup-node")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.node_version:
        version = load_build(root)[3]["NODE_VERSION"]
        if not version.strip() or "\n" in version or "\r" in version:
            raise ValueError("NODE_VERSION must be a single nonempty line")
        print(version)
    else:
        check_build(root)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(f"Netlify build command failed (exit {error.returncode})", file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, OSError) as error:
        print(f"Netlify build check failed: {error}", file=sys.stderr)
        sys.exit(1)
