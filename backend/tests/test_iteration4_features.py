"""Iteration-4 regression tests: follow system, chat limit + mutual bypass,
privacy stripping, gender immutability, VIP upgrade, learning truncation,
photo moments + media, notifications, rooms multi-language.

Run:
  cd /app/backend && python -m pytest tests/test_iteration4_features.py -v \
      --junitxml=/app/test_reports/pytest/iteration4.xml
"""
import base64
import os
import uuid

import pytest
import requests

BASE = os.environ.get("BACKEND_URL_INTERNAL", "http://localhost:8001") + "/api"

DEMO = {"email": "demo@demo.com", "password": "Demo1234!"}
MEI = {"email": "mei@demo.com", "password": "Demo1234!"}
DIEGO = {"email": "diego@demo.com", "password": "Demo1234!"}
YUKI = {"email": "yuki@demo.com", "password": "Demo1234!"}

# 1x1 red PNG (base64)
PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
    "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _register(prefix="TEST_"):
    email = f"{prefix}{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(
        f"{BASE}/auth/register",
        json={"email": email, "password": "Demo1234!", "name": f"{prefix}User"},
    )
    assert r.status_code in (200, 201), r.text
    d = r.json()
    return d["token"], d["user"], email


# ---------- Follow toggle + counts + lists ----------
class TestFollow:
    def test_follow_toggle_updates_counts(self):
        demo_t, demo = _login(DEMO)
        _, mei = _login(MEI)

        # baseline
        r0 = requests.get(f"{BASE}/users/{mei['id']}", headers=_h(demo_t))
        assert r0.status_code == 200
        before = r0.json()["followers_count"]
        was_following = r0.json()["is_following"]

        # toggle once
        r1 = requests.post(f"{BASE}/users/{mei['id']}/follow", headers=_h(demo_t))
        assert r1.status_code == 200
        d1 = r1.json()
        assert isinstance(d1["following"], bool)
        assert d1["following"] == (not was_following)
        expected = before + (1 if d1["following"] else -1)
        assert d1["followers_count"] == expected

        # GET reflects new count + is_following flag
        r2 = requests.get(f"{BASE}/users/{mei['id']}", headers=_h(demo_t))
        assert r2.json()["followers_count"] == expected
        assert r2.json()["is_following"] == d1["following"]

        # toggle back to keep state stable
        r3 = requests.post(f"{BASE}/users/{mei['id']}/follow", headers=_h(demo_t))
        assert r3.json()["following"] == (not d1["following"])
        assert r3.json()["followers_count"] == before

    def test_follow_self_400(self):
        demo_t, demo = _login(DEMO)
        r = requests.post(f"{BASE}/users/{demo['id']}/follow", headers=_h(demo_t))
        assert r.status_code == 400

    def test_follow_unknown_user_404(self):
        demo_t, _ = _login(DEMO)
        r = requests.post(f"{BASE}/users/does-not-exist/follow", headers=_h(demo_t))
        assert r.status_code == 404

    def test_followers_and_following_lists(self):
        demo_t, demo = _login(DEMO)
        _, mei = _login(MEI)
        # Ensure demo follows mei
        r0 = requests.get(f"{BASE}/users/{mei['id']}", headers=_h(demo_t))
        if not r0.json()["is_following"]:
            requests.post(f"{BASE}/users/{mei['id']}/follow", headers=_h(demo_t))

        # demo /following should include mei
        r1 = requests.get(f"{BASE}/users/me/following", headers=_h(demo_t))
        assert r1.status_code == 200
        following = r1.json()
        assert isinstance(following, list)
        assert any(u["id"] == mei["id"] for u in following)

        # mei /followers should include demo
        mei_t, _ = _login(MEI)
        r2 = requests.get(f"{BASE}/users/me/followers", headers=_h(mei_t))
        assert r2.status_code == 200
        followers = r2.json()
        assert any(u["id"] == demo["id"] for u in followers)

        # cleanup: unfollow
        requests.post(f"{BASE}/users/{mei['id']}/follow", headers=_h(demo_t))


# ---------- Gender immutability + VIP upgrade + truncation ----------
class TestGenderAndVIP:
    def test_gender_immutable_once_set(self):
        # Register fresh, set gender male, then try to change to female
        t, u, _ = _register("TEST_gender_")
        r0 = requests.put(
            f"{BASE}/users/me", json={"gender": "male"}, headers=_h(t)
        )
        assert r0.status_code == 200
        assert r0.json()["gender"] == "male"

        r1 = requests.put(
            f"{BASE}/users/me", json={"gender": "female"}, headers=_h(t)
        )
        assert r1.status_code == 200
        # gender must remain unchanged
        assert r1.json()["gender"] == "male"

    def test_vip_upgrade_flag(self):
        t, u, _ = _register("TEST_vip_")
        assert u["is_vip"] is False
        r = requests.post(f"{BASE}/users/me/vip", headers=_h(t))
        assert r.status_code == 200
        assert r.json()["is_vip"] is True
        # /auth/me confirms
        r2 = requests.get(f"{BASE}/auth/me", headers=_h(t))
        assert r2.json()["is_vip"] is True

    def test_non_vip_learning_languages_truncated_to_one(self):
        t, u, _ = _register("TEST_learntrunc_")
        # Try to set 3 learning languages on a fresh non-VIP user
        r = requests.put(
            f"{BASE}/users/me",
            json={"learning_languages": ["es", "fr", "zh"], "teach_languages": ["en"]},
            headers=_h(t),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["learning_languages"] == ["es"]
        # teach must be stripped for non-VIP
        assert d["teach_languages"] == []

    def test_vip_can_set_three_learning_and_two_teach(self):
        t, u, _ = _register("TEST_vipmulti_")
        # upgrade first
        requests.post(f"{BASE}/users/me/vip", headers=_h(t))
        r = requests.put(
            f"{BASE}/users/me",
            json={
                "learning_languages": ["es", "fr", "zh"],
                "teach_languages": ["en", "de"],
            },
            headers=_h(t),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["learning_languages"] == ["es", "fr", "zh"]
        assert d["teach_languages"] == ["en", "de"]


# ---------- Privacy stripping ----------
class TestPrivacy:
    def test_hidden_fields_stripped_for_other_viewers(self):
        # Fresh user hides age + country + gender + interests, viewer=demo
        t, u, _ = _register("TEST_priv_")
        # Set gender + interests + note country/age are 'set once' on non-onboarded doc
        requests.put(
            f"{BASE}/users/me",
            json={
                "country": "Japan",
                "age": 25,
                "gender": "female",
                "interests": ["movies", "music"],
                "privacy": {
                    "show_age": False,
                    "show_gender": False,
                    "show_country": False,
                    "show_interests": False,
                    "show_online": False,
                },
            },
            headers=_h(t),
        )
        # Demo views this user
        demo_t, _ = _login(DEMO)
        r = requests.get(f"{BASE}/users/{u['id']}", headers=_h(demo_t))
        assert r.status_code == 200
        body = r.json()
        assert body.get("age") is None
        assert body.get("gender") is None
        assert body.get("country") is None
        assert body.get("interests") == []
        assert body.get("is_online") is False
        # email not leaked
        assert "email" not in body

    def test_self_view_shows_all_fields(self):
        t, u, _ = _register("TEST_privself_")
        requests.put(
            f"{BASE}/users/me",
            json={
                "country": "Japan",
                "age": 30,
                "gender": "male",
                "interests": ["music"],
                "privacy": {
                    "show_age": False,
                    "show_gender": False,
                    "show_country": False,
                    "show_interests": False,
                },
            },
            headers=_h(t),
        )
        r = requests.get(f"{BASE}/users/{u['id']}", headers=_h(t))
        assert r.status_code == 200
        b = r.json()
        # self view: privacy should NOT be applied
        assert b.get("age") == 30
        assert b.get("gender") == "male"
        assert b.get("country") == "Japan"
        assert b.get("interests") == ["music"]


# ---------- Free chat limit (10) + mutual-follow bypass ----------
class TestChatLimit:
    def test_free_user_blocked_after_10_and_mutual_follow_bypasses(self):
        # Create a fresh non-VIP user "A"
        a_tok, a, _ = _register("TEST_climitA_")
        # Try to open 10 chats with 10 fresh partners
        partner_ids = []
        for i in range(10):
            _, p, _ = _register(f"TEST_climitP{i}_")
            partner_ids.append(p["id"])
            r = requests.post(
                f"{BASE}/chats", json={"partner_id": p["id"]}, headers=_h(a_tok)
            )
            assert r.status_code == 200, r.text

        # 11th unrelated partner should be blocked
        _, blocked_partner, _ = _register("TEST_climitBLOCK_")
        r = requests.post(
            f"{BASE}/chats",
            json={"partner_id": blocked_partner["id"]},
            headers=_h(a_tok),
        )
        assert r.status_code == 403, r.text
        assert "10" in r.json()["detail"] or "VIP" in r.json()["detail"]

        # Now create a mutual-follow partner — should BYPASS the limit
        bp_tok, bp, _ = _register("TEST_climitBYPASS_")
        # A follows BP, BP follows A
        requests.post(f"{BASE}/users/{bp['id']}/follow", headers=_h(a_tok))
        requests.post(f"{BASE}/users/{a['id']}/follow", headers=_h(bp_tok))
        r2 = requests.post(
            f"{BASE}/chats", json={"partner_id": bp["id"]}, headers=_h(a_tok)
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["partner"]["id"] == bp["id"]


# ---------- Photo moment + media serving + notifications ----------
class TestMomentsAndNotifications:
    def test_photo_moment_creates_image_url_and_media_serves(self):
        t, _ = _login(DEMO)
        r = requests.post(
            f"{BASE}/moments",
            json={"text": "TEST photo moment", "image_base64": PNG_B64, "mime": "image/png"},
            headers=_h(t),
        )
        assert r.status_code == 201, r.text
        m = r.json()
        assert m["image_url"] and m["image_url"].startswith("/api/media/")
        media_id = m["image_url"].split("/")[-1]
        # media served
        r2 = requests.get(f"{BASE}/media/{media_id}")
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")
        assert r2.content == base64.b64decode(PNG_B64)

    def test_notification_on_like_and_comment_and_read(self):
        demo_t, demo = _login(DEMO)
        mei_t, mei = _login(MEI)
        # demo posts a moment
        r = requests.post(
            f"{BASE}/moments",
            json={"text": "TEST notif moment"},
            headers=_h(demo_t),
        )
        assert r.status_code == 201
        moment_id = r.json()["id"]

        # baseline demo unread count
        base_r = requests.get(f"{BASE}/notifications", headers=_h(demo_t))
        base_unread = base_r.json()["unread"]

        # mei likes -> notif for demo
        rl = requests.post(f"{BASE}/moments/{moment_id}/like", headers=_h(mei_t))
        assert rl.status_code == 200

        # mei comments -> notif for demo
        rc = requests.post(
            f"{BASE}/moments/{moment_id}/comments",
            json={"text": "TEST comment for notif"},
            headers=_h(mei_t),
        )
        assert rc.status_code == 201

        # demo /notifications shows unread >= base+2
        r2 = requests.get(f"{BASE}/notifications", headers=_h(demo_t))
        assert r2.status_code == 200
        body = r2.json()
        assert body["unread"] >= base_unread + 2
        types = [n["type"] for n in body["notifications"][:10]]
        assert "like" in types
        assert "comment" in types
        # notifications carry actor card + moment_id
        top = body["notifications"][0]
        assert top["actor"] and top["actor"]["id"] == mei["id"]
        assert top["moment_id"] == moment_id

        # mark all read -> unread should drop to 0
        r3 = requests.post(f"{BASE}/notifications/read", headers=_h(demo_t))
        assert r3.status_code == 200
        r4 = requests.get(f"{BASE}/notifications", headers=_h(demo_t))
        assert r4.json()["unread"] == 0


# ---------- Rooms multi-language ----------
class TestRoomsLanguages:
    def test_room_create_with_two_languages_returned_in_list(self):
        demo_t, _ = _login(DEMO)
        r = requests.post(
            f"{BASE}/rooms",
            json={"title": "TEST multi-lang room", "language": "en", "languages": ["en", "es"]},
            headers=_h(demo_t),
        )
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["languages"] == ["en", "es"]
        room_id = d["id"]

        # list should include both languages
        rl = requests.get(f"{BASE}/rooms", headers=_h(demo_t))
        assert rl.status_code == 200
        card = next(x for x in rl.json() if x["id"] == room_id)
        assert card["languages"] == ["en", "es"]

        # cleanup - end room
        requests.post(f"{BASE}/rooms/{room_id}/end", headers=_h(demo_t))

    def test_room_create_limits_to_two_languages(self):
        demo_t, _ = _login(DEMO)
        # Send 3 in payload — pydantic max_length=2 should 422 OR backend slices to 2
        r = requests.post(
            f"{BASE}/rooms",
            json={"title": "TEST three-lang room", "language": "en", "languages": ["en", "es", "fr"]},
            headers=_h(demo_t),
        )
        # We accept either 422 (pydantic rejects) or 201 with truncated list
        assert r.status_code in (201, 422)
        if r.status_code == 201:
            assert len(r.json()["languages"]) <= 2
            requests.post(f"{BASE}/rooms/{r.json()['id']}/end", headers=_h(demo_t))


# ---------- Visitors 2-tab (visited me / I visited) ----------
class TestVisitors:
    def test_visited_endpoint_returns_users_i_visited(self):
        mei_t, mei = _login(MEI)
        _, demo = _login(DEMO)
        # mei visits demo
        r0 = requests.get(f"{BASE}/users/{demo['id']}", headers=_h(mei_t))
        assert r0.status_code == 200
        # mei /me/visited must include demo
        r = requests.get(f"{BASE}/users/me/visited", headers=_h(mei_t))
        assert r.status_code == 200
        d = r.json()
        assert "count" in d and "visitors" in d
        assert any(v["id"] == demo["id"] for v in d["visitors"])
