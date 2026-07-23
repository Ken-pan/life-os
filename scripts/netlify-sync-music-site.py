#!/usr/bin/env python3
"""Align kenos-music Netlify site with life-os monorepo (build settings + optional deploy)."""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

CONFIG = os.path.expanduser("~/Library/Preferences/netlify/config.json")
MUSIC_SITE = "83dfdf84-095a-4b8a-955d-106d046a314b"
PLANNER_SITE = "82a6cadc-03f9-443c-85f7-26bd4a90f83f"
LIFE_OS_REPO = "https://github.com/Ken-pan/life-os"


def token():
    data = json.load(open(CONFIG))
    uid = next(iter(data["users"]))
    return data["users"][uid]["auth"]["token"]


def get_site(site_id, auth):
    req = urllib.request.Request(
        f"https://api.netlify.com/api/v1/sites/{site_id}",
        headers={"Authorization": f"Bearer {auth}"},
    )
    return json.loads(urllib.request.urlopen(req).read())


def patch_site(site_id, auth, body):
    req = urllib.request.Request(
        f"https://api.netlify.com/api/v1/sites/{site_id}",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {auth}",
            "Content-Type": "application/json",
        },
        method="PATCH",
    )
    return json.loads(urllib.request.urlopen(req).read())


def main():
    auth = token()
    deploy_key = get_site(PLANNER_SITE, auth)["build_settings"]["deploy_key_id"]

    patch_site(
        MUSIC_SITE,
        auth,
        {
            "build_settings": {
                "repo_path": "Ken-pan/life-os",
                "repo_url": LIFE_OS_REPO,
                "repo_branch": "master",
                "provider": "github",
                "cmd": "npm run build -w music-os",
                "dir": "apps/music/build",
                "package_path": "apps/music",
                "deploy_key_id": deploy_key,
                "installation_id": None,
            }
        },
    )

    site = get_site(MUSIC_SITE, auth)
    bs = site.get("build_settings", {})
    print("music repo:", bs.get("repo_url"))
    print("music dir:", bs.get("dir"))
    print("music pkg:", bs.get("package_path"))

    if bs.get("repo_url") != LIFE_OS_REPO:
        print(
            "\nWARN: Git repo still not life-os. In Netlify UI → kenos-music → Build settings,\n"
            "link repository to Ken-pan/life-os (branch master, base apps/music).\n"
            "Until then, use: netlify deploy --prod --no-build --site=83dfdf84... --dir=apps/music/build"
        )
        return 1

    if "--deploy" in sys.argv:
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        subprocess.run(["npm", "run", "build:music"], cwd=root, check=True)
        subprocess.run(
            [
                "netlify",
                "deploy",
                "--prod",
                "--no-build",
                f"--site={MUSIC_SITE}",
                "--dir=apps/music/build",
            ],
            cwd=root,
            check=True,
            env={**os.environ, "NETLIFY_AUTH_TOKEN": auth},
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as e:
        print("API error:", e.code, e.read().decode()[:400], file=sys.stderr)
        raise SystemExit(1)
