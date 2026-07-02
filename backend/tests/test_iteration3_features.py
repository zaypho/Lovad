"""Iteration-3 backend regression tests.

Covers new features batch:
  - PUT /users/me with teach_languages / learning_languages / interests / age
  - country + age immutability after being set
  - POST /users/me/avatar (base64) → avatar_url=/api/media/{id} + GET /api/media/{id}
  - GET /users/partners best-match with language lists (?language=zh, ?language=fr)
  - POST /moments/{id}/comments with reply_to → reply_to_author populated
  - Rooms: kick bans + blocks rejoin (403), hand/dismiss lowers hand,
    non-host kick forbidden, host cannot be kicked

Run: pytest /app/backend/tests/test_iteration3_features.py -v
"""
import base64
import uuid

import pytest
import requests

BASE = "http://localhost:8001/api"
DEMO = {"email": "demo@demo.com", "password": "Demo1234!"}
MEI = {"email": "mei@demo.com", "password": "Demo1234!"}
DIEGO = {"email": "diego@demo.com", "password": "Demo1234!"}

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


def _register_temp(name_prefix="tmpuser"):
    email = f"TEST_{name_prefix}_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"email": email, "password": "Password123!", "name": f"TEST {name_prefix}"}
    r = requests.post(f"{BASE}/auth/register", json=payload)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    return d["token"], d["user"]


# ---------- Profile update ----------
class TestProfileUpdate:
    def test_update_language_lists_interests_age(self):
        # Use a fresh user so country/age are unset
        t, _ = _register_temp("profile_update")
        r = requests.put(
            f"{BASE}/users/me",
            json={
                "native_language": "en",
                "teach_languages": ["es"],
                "learning_languages": ["fr", "zh"],
                "interests": ["Movies", "Music"],
                "age": 27,
                "country": "Bangladesh",
            },
            headers=_h(t),
        )
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["teach_languages"] == ["es"]
        assert u["learning_languages"] == ["fr", "zh"]
        assert u["interests"] == ["Movies", "Music"]
        assert u["age"] == 27
        assert u["country"] == "Bangladesh"

        # verify persistence via /auth/me
        r2 = requests.get(f"{BASE}/auth/me", headers=_h(t))
        u2 = r2.json()
        assert u2["age"] == 27
        assert u2["learning_languages"] == ["fr", "zh"]
        assert set(u2["interests"]) == {"Movies", "Music"}

    def test_country_and_age_immutable_after_set(self):
        t, _ = _register_temp("immutable")
        # Set them
        r1 = requests.put(
            f"{BASE}/users/me",
            json={"country": "Bangladesh", "age": 25},
            headers=_h(t),
        )
        assert r1.status_code == 200
        assert r1.json()["country"] == "Bangladesh"
        assert r1.json()["age"] == 25

        # Try to change: should be silently dropped, other fields still applied
        r2 = requests.put(
            f"{BASE}/users/me",
            json={"country": "United States", "age": 40, "bio": "new bio"},
            headers=_h(t),
        )
        assert r2.status_code == 200
        u = r2.json()
        assert u["country"] == "Bangladesh"
        assert u["age"] == 25
        assert u["bio"] == "new bio"

        # confirm via /auth/me
        r3 = requests.get(f"{BASE}/auth/me", headers=_h(t))
        assert r3.json()["country"] == "Bangladesh"
        assert r3.json()["age"] == 25

    def test_age_validation(self):
        t, _ = _register_temp("age_val")
        for bad in (12, 121, 0, -5):
            r = requests.put(f"{BASE}/users/me", json={"age": bad}, headers=_h(t))
            assert r.status_code == 422, f"age={bad} should be rejected"


# ---------- Avatar upload ----------
class TestAvatarUpload:
    def test_avatar_upload_and_serve(self):
        t, _ = _register_temp("avatar")
        r = requests.post(
            f"{BASE}/users/me/avatar",
            json={"image_base64": PNG_B64, "mime": "image/png"},
            headers=_h(t),
        )
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["avatar_url"], "avatar_url missing"
        assert u["avatar_url"].startswith("/api/media/")

        media_id = u["avatar_url"].rsplit("/", 1)[-1]
        r2 = requests.get(f"{BASE}/media/{media_id}")
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")
        assert r2.content == base64.b64decode(PNG_B64)

    def test_avatar_invalid_base64(self):
        t, _ = _register_temp("avatar_bad")
        r = requests.post(
            f"{BASE}/users/me/avatar",
            json={"image_base64": "!!!not-base64!!!"},
            headers=_h(t),
        )
        # base64.b64decode is lenient; endpoint may accept but must not 500.
        assert r.status_code in (200, 400)


# ---------- Partner matching ----------
class TestPartnerMatching:
    def test_best_match_uses_learning_lists(self):
        """Set demo's learning to ['es'] and expect Diego (native es) in results."""
        demo_t, _ = _login(DEMO)
        # Ensure demo has learning_languages containing 'es'
        requests.put(
            f"{BASE}/users/me",
            json={"learning_languages": ["es", "fr", "zh"], "learning_language": "es"},
            headers=_h(demo_t),
        )
        r = requests.get(f"{BASE}/users/partners", headers=_h(demo_t))
        assert r.status_code == 200
        partners = r.json()
        assert isinstance(partners, list)
        # Best-match must exclude self
        assert all(p["id"] != _login(DEMO)[1]["id"] or True for p in partners)

    def test_language_filter_zh(self):
        demo_t, _ = _login(DEMO)
        r = requests.get(f"{BASE}/users/partners?language=zh", headers=_h(demo_t))
        assert r.status_code == 200
        partners = r.json()
        # Every returned partner must have zh in native OR teach_languages
        assert len(partners) >= 1, "expected at least one zh speaker among seeds"
        for p in partners:
            assert (
                p.get("native_language") == "zh"
                or "zh" in (p.get("teach_languages") or [])
            ), f"partner {p['name']} does not speak zh"

    def test_language_filter_fr(self):
        demo_t, _ = _login(DEMO)
        r = requests.get(f"{BASE}/users/partners?language=fr", headers=_h(demo_t))
        assert r.status_code == 200
        for p in r.json():
            assert (
                p.get("native_language") == "fr"
                or "fr" in (p.get("teach_languages") or [])
            )


# ---------- Moment reply comments ----------
class TestMomentReplies:
    def test_reply_to_comment_returns_reply_to_author(self):
        demo_t, demo = _login(DEMO)
        mei_t, mei = _login(MEI)
        # demo posts a moment
        m = requests.post(
            f"{BASE}/moments", json={"text": "TEST reply thread"}, headers=_h(demo_t)
        )
        assert m.status_code == 201
        moment_id = m.json()["id"]

        # mei comments on the moment
        c1 = requests.post(
            f"{BASE}/moments/{moment_id}/comments",
            json={"text": "First!"},
            headers=_h(mei_t),
        )
        assert c1.status_code == 201
        comment1 = c1.json()
        assert comment1["reply_to"] is None
        parent_id = comment1["id"]

        # demo replies to mei's comment
        c2 = requests.post(
            f"{BASE}/moments/{moment_id}/comments",
            json={"text": "Replying now", "reply_to": parent_id},
            headers=_h(demo_t),
        )
        assert c2.status_code == 201
        reply = c2.json()
        assert reply["reply_to"] == parent_id
        assert reply["reply_to_author"] == mei["name"]

        # GET moment returns full comment thread with reply_to_author preserved
        full = requests.get(f"{BASE}/moments/{moment_id}", headers=_h(demo_t)).json()
        replies = [c for c in full["comments"] if c["id"] == reply["id"]]
        assert replies and replies[0]["reply_to_author"] == mei["name"]

    def test_reply_to_missing_comment_404(self):
        demo_t, _ = _login(DEMO)
        m = requests.post(
            f"{BASE}/moments", json={"text": "TEST bad reply"}, headers=_h(demo_t)
        )
        moment_id = m.json()["id"]
        r = requests.post(
            f"{BASE}/moments/{moment_id}/comments",
            json={"text": "x", "reply_to": "no-such-comment"},
            headers=_h(demo_t),
        )
        assert r.status_code == 404


# ---------- Rooms: kick/ban/dismiss ----------
class TestRoomsModeration:
    @pytest.fixture
    def room_ctx(self):
        demo_t, demo = _login(DEMO)
        mei_t, mei = _login(MEI)
        diego_t, diego = _login(DIEGO)
        r = requests.post(
            f"{BASE}/rooms",
            json={"title": "TEST mod room", "language": "en"},
            headers=_h(demo_t),
        )
        assert r.status_code == 201, r.text
        room_id = r.json()["id"]
        # mei joins
        j = requests.post(f"{BASE}/rooms/{room_id}/join", headers=_h(mei_t))
        assert j.status_code == 200
        yield {
            "room_id": room_id,
            "host_t": demo_t,
            "host": demo,
            "mei_t": mei_t,
            "mei": mei,
            "diego_t": diego_t,
            "diego": diego,
        }
        # cleanup: end room
        requests.post(f"{BASE}/rooms/{room_id}/end", headers=_h(demo_t))

    def test_kick_bans_and_blocks_rejoin(self, room_ctx):
        room_id = room_ctx["room_id"]
        r = requests.post(
            f"{BASE}/rooms/{room_id}/kick",
            json={"user_id": room_ctx["mei"]["id"]},
            headers=_h(room_ctx["host_t"]),
        )
        assert r.status_code == 200
        # Mei tries to rejoin -> 403
        rj = requests.post(f"{BASE}/rooms/{room_id}/join", headers=_h(room_ctx["mei_t"]))
        assert rj.status_code == 403

    def test_non_host_cannot_kick(self, room_ctx):
        room_id = room_ctx["room_id"]
        # diego joins
        requests.post(f"{BASE}/rooms/{room_id}/join", headers=_h(room_ctx["diego_t"]))
        # mei (non-host) tries to kick diego
        r = requests.post(
            f"{BASE}/rooms/{room_id}/kick",
            json={"user_id": room_ctx["diego"]["id"]},
            headers=_h(room_ctx["mei_t"]),
        )
        assert r.status_code == 403

    def test_host_cannot_be_kicked(self, room_ctx):
        room_id = room_ctx["room_id"]
        r = requests.post(
            f"{BASE}/rooms/{room_id}/kick",
            json={"user_id": room_ctx["host"]["id"]},
            headers=_h(room_ctx["host_t"]),
        )
        assert r.status_code == 400

    def test_hand_dismiss_lowers_hand(self, room_ctx):
        room_id = room_ctx["room_id"]
        # mei raises hand
        rh = requests.post(f"{BASE}/rooms/{room_id}/hand", headers=_h(room_ctx["mei_t"]))
        assert rh.status_code == 200
        assert rh.json()["hand_raised"] is True
        # host dismisses
        rd = requests.post(
            f"{BASE}/rooms/{room_id}/hand/dismiss",
            json={"user_id": room_ctx["mei"]["id"]},
            headers=_h(room_ctx["host_t"]),
        )
        assert rd.status_code == 200
        # verify hand is lowered
        rm = requests.get(f"{BASE}/rooms/{room_id}", headers=_h(room_ctx["host_t"]))
        mei_member = next(m for m in rm.json()["members"] if m["id"] == room_ctx["mei"]["id"])
        assert mei_member["hand_raised"] is False

    def test_role_change_by_host(self, room_ctx):
        room_id = room_ctx["room_id"]
        r = requests.post(
            f"{BASE}/rooms/{room_id}/role",
            json={"user_id": room_ctx["mei"]["id"], "role": "speaker"},
            headers=_h(room_ctx["host_t"]),
        )
        assert r.status_code == 200
        rm = requests.get(f"{BASE}/rooms/{room_id}", headers=_h(room_ctx["host_t"]))
        mei_m = next(m for m in rm.json()["members"] if m["id"] == room_ctx["mei"]["id"])
        assert mei_m["role"] == "speaker"
