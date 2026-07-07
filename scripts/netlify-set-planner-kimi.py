#!/usr/bin/env python3
"""Ensure planner KIMI_API_KEY matches finance (force overwrite via Netlify API)."""
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


def delete_planner_kimi(auth):
    url = f"https://api.netlify.com/api/v1/accounts/{ACCOUNT}/env/KIMI_API_KEY?site_id={PLANNER}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {auth}"}, method="DELETE")
    try:
        urllib.request.urlopen(req)
        print("deleted planner KIMI_API_KEY")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise


def main():
    auth = token()
    planner_env = env_list(PLANNER, auth)
    has_kimi = "KIMI_API_KEY" in {e.get("key") for e in planner_env}
    if has_kimi:
        print("planner KIMI_API_KEY exists — deleting before clone")
        delete_planner_kimi(auth)

    print("Run:")
    print(
        "  cd apps/planner && CI=1 NETLIFY_SITE_ID=%s"
        % PLANNER
    )
    print(
        "  npx netlify env:clone --from %s --to %s --force"
        % (FINANCE, PLANNER)
    )
    print(
        "  cd ../.. && CI=1 npx netlify deploy --prod --no-build --filter planner-os "
        "--dir=apps/planner/build --functions=netlify/functions --site=%s"
        % PLANNER
    )


if __name__ == "__main__":
    main()
