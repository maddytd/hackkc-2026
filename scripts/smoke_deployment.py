"""Exercise the Docker deployment using only the Python standard library."""

import json
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base, clip = sys.argv[1:]


def request(path, data=None, method=None, token=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if token:
        headers["Authorization"] = "Bearer " + token
    if isinstance(data, dict):
        data = json.dumps(data).encode()
    with urlopen(
        Request(base + path, data=data, headers=headers, method=method), timeout=15
    ) as r:
        return json.load(r)


# Restart verification is a separate invocation so no in-memory state can hide data loss.
if clip == "--check-persistence":
    board = request("/api/leaderboard")
    assert any(
        e["alias"] == "docker_smoke" and e["final_score"] == 3000
        for e in board["entries"]
    )
    print("Persisted score is present after restarting the API and worker.")
    raise SystemExit(0)

with urlopen(base, timeout=10) as r:
    assert b'<div id="root">' in r.read(), "Frontend is not being served"
health = request("/api/health")
assert health["judge_mode"] == "demo", "Smoke tests must not make real AI calls"
credentials = {
    "alias": "docker_smoke",
    "password": "test-only-password",
    "invite_code": "wrong",
}
try:
    request("/api/auth/register", credentials)
except HTTPError as e:
    assert e.code == 403
else:
    raise AssertionError("Invalid invite code accepted")
credentials["invite_code"] = "smoke-test-invite"
session = request("/api/auth/register", credentials)
token = session["access_token"]
a = request("/api/attempts", {"consent_to_ai_processing": True}, token=token)
assert a["demo"]
a = request(
    "/api/attempts/" + a["id"] + "/video",
    Path(clip).read_bytes(),
    method="PUT",
    token=token,
    content_type="video/webm",
)
for _ in range(30):
    if a["status"] == "completed":
        break
    assert a["status"] in ("queued", "processing"), a
    time.sleep(1)
    a = request("/api/attempts/" + a["id"], token=token)
assert a["status"] == "completed", a
assert a["score"]["final_score"] == 3000, a
board = request("/api/leaderboard")
assert board["demo"] and board["entries"][0]["alias"] == "docker_smoke"
print(
    "Frontend, API routing, invites, media validation, worker scoring, and leaderboard passed."
)
