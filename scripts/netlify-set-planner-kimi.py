#!/usr/bin/env python3
"""Copy KIMI_API_KEY from finance site to planner site if missing."""
import json
import os
import urllib.error
import urllib.request

CONFIG = os.path.expanduser("~/Library/Preferences/netlify/config.json")
PLANNER = "82a6cadc-03f9-443c-85f7-26bd4a90f83f"
FINANCE = "fc92f305-8dcf-46c3-82f5-ef511597df1c"
ACCOUNT = "616051ca766fa85b97a0ed43"


def token():
    data = json.load(open(CONFIG))
    uid = next(iter(data["users"]))
    return data["users"][uid]["auth"]["token"]


def env_list(site_id, auth):
    req = urllib.request.Request(
        f"https://api.netlify.com/api/v1/sites/{site_id}/env",
        headers={"Authorization": f"Bearer {auth}"},
    )
    return json.loads(urllib.request.urlopen(req).read())


def env_value(envs, key):
    for e in envs:
        if e.get("key") == key:
            values = e.get("values") or []
            if values:
                return values[0].get("value")
    return None


def create_site_env(auth, site_id, key, value):
    body = [
        {
            "key": key,
            "scopes": ["builds", "functions", "runtime"],
            "is_secret": True,
            "values": [
                {"context": "production", "value": value},
                {"context": "deploy-preview", "value": value},
                {"context": "branch-deploy", "value": value},
            ],
        }
    ]
    url = f"https://api.netlify.com/api/v1/accounts/{ACCOUNT}/env?site_id={site_id}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {auth}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    urllib.request.urlopen(req)


def main():
    auth = token()
    planner_env = env_list(PLANNER, auth)
    if "KIMI_API_KEY" in {e.get("key") for e in planner_env}:
        print("planner KIMI_API_KEY already set")
        return

    kimi = env_value(env_list(FINANCE, auth), "KIMI_API_KEY")
    if not kimi:
        env_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "apps", "planner", ".env")
        )
        if os.path.isfile(env_path):
            for line in open(env_path):
                if line.startswith("KIMI_API_KEY="):
                    kimi = line.split("=", 1)[1].strip().strip("\"'")
                    break

    if not kimi:
        print("WARN: no KIMI_API_KEY source found")
        return

    create_site_env(auth, PLANNER, "KIMI_API_KEY", kimi)
    print("planner KIMI_API_KEY set")


if __name__ == "__main__":
    main()
