"""Auth: registration, login, token type confinement, refresh, logout.

The security-relevant assertions here are the ones worth reading:
  - the password is never stored or returned in plaintext
  - the refresh token is httpOnly and never appears in a response body
  - a refresh token cannot be replayed as an access token
  - login does not reveal whether an email has an account
"""

from __future__ import annotations

import jwt

from core.config import SECRET_KEY
from core.security import ALGORITHM, create_refresh_token

PASSWORD = "correct-horse-battery"

# Rate limiters are reset between tests by an autouse fixture in conftest.py.


# --- registration ------------------------------------------------------


def test_register_returns_token_and_user(client):
    resp = client.post(
        "/api/auth/register", json={"email": "New@Example.com", "password": PASSWORD}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["email"] == "new@example.com"  # normalized to lowercase
    assert "password" not in resp.text and PASSWORD not in resp.text


def test_refresh_token_is_httponly_and_not_in_body(client):
    resp = client.post(
        "/api/auth/register", json={"email": "a@example.com", "password": PASSWORD}
    )
    assert "refresh_token" not in resp.json()  # body must never carry it
    cookie_header = resp.headers["set-cookie"]
    assert "refresh_token=" in cookie_header
    assert "HttpOnly" in cookie_header  # JS/XSS cannot read it


def test_duplicate_email_is_rejected(client):
    payload = {"email": "dupe@example.com", "password": PASSWORD}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 409


def test_duplicate_email_is_case_insensitive(client):
    client.post("/api/auth/register", json={"email": "Case@Example.com", "password": PASSWORD})
    resp = client.post(
        "/api/auth/register", json={"email": "case@example.com", "password": PASSWORD}
    )
    assert resp.status_code == 409


def test_short_password_is_rejected(client):
    resp = client.post("/api/auth/register", json={"email": "x@example.com", "password": "short"})
    assert resp.status_code == 422


def test_invalid_email_is_rejected(client):
    resp = client.post("/api/auth/register", json={"email": "not-an-email", "password": PASSWORD})
    assert resp.status_code == 422


# --- login -------------------------------------------------------------


def test_login_succeeds_with_correct_password(client):
    client.post("/api/auth/register", json={"email": "u@example.com", "password": PASSWORD})
    resp = client.post("/api/auth/login", json={"email": "u@example.com", "password": PASSWORD})
    assert resp.status_code == 200
    assert resp.json()["access_token"]


def test_login_with_wrong_password_fails(client):
    client.post("/api/auth/register", json={"email": "u@example.com", "password": PASSWORD})
    resp = client.post("/api/auth/login", json={"email": "u@example.com", "password": "wrong-one"})
    assert resp.status_code == 401


def test_login_does_not_reveal_whether_email_exists(client):
    """Unknown email and wrong password must be indistinguishable, or the
    endpoint becomes an account-enumeration oracle."""
    client.post("/api/auth/register", json={"email": "real@example.com", "password": PASSWORD})

    unknown = client.post(
        "/api/auth/login", json={"email": "ghost@example.com", "password": PASSWORD}
    )
    wrong_pw = client.post(
        "/api/auth/login", json={"email": "real@example.com", "password": "wrong-one"}
    )
    assert unknown.status_code == wrong_pw.status_code == 401
    assert unknown.json()["detail"] == wrong_pw.json()["detail"]


# --- token handling ----------------------------------------------------


def test_me_requires_a_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_the_current_user(client, auth):
    headers, user = auth()
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == user["email"]


def test_garbage_token_is_rejected(client):
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert resp.status_code == 401


def test_refresh_token_cannot_be_used_as_an_access_token(client, auth):
    """The `type` claim is the whole point: both tokens are signed with the
    same key, so without it a long-lived refresh token would be accepted as
    an access token."""
    _, user = auth()
    stolen, _jti = create_refresh_token(user["id"])
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {stolen}"})
    assert resp.status_code == 401


def test_expired_token_is_rejected(client, auth):
    import datetime as dt

    _, user = auth()
    expired = jwt.encode(
        {
            "sub": str(user["id"]),
            "type": "access",
            "exp": dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401


def test_token_signed_with_another_key_is_rejected(client, auth):
    _, user = auth()
    forged = jwt.encode({"sub": str(user["id"]), "type": "access"}, "attacker-key", algorithm="HS256")
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401


# --- refresh / logout --------------------------------------------------


def test_refresh_mints_a_new_access_token_from_the_cookie(client):
    client.post("/api/auth/register", json={"email": "r@example.com", "password": PASSWORD})
    # The cookie jar carries the refresh cookie; no Authorization header needed.
    resp = client.post("/api/auth/refresh")
    assert resp.status_code == 200
    assert resp.json()["access_token"]


def test_refresh_without_a_cookie_fails(client):
    client.cookies.clear()
    assert client.post("/api/auth/refresh").status_code == 401


def test_logout_clears_the_refresh_cookie(client):
    client.post("/api/auth/register", json={"email": "o@example.com", "password": PASSWORD})
    assert client.post("/api/auth/logout").status_code == 204
    client.cookies.clear()  # the browser would drop it; mirror that here
    assert client.post("/api/auth/refresh").status_code == 401


# --- revocation, rotation, reuse detection -----------------------------


def test_logout_revokes_the_token_server_side(client):
    """The security property: deleting the cookie is not enough. An attacker
    who kept a copy of the token must not be able to keep using it after the
    user signs out."""
    resp = client.post(
        "/api/auth/register", json={"email": "rv@example.com", "password": PASSWORD}
    )
    stolen_copy = resp.cookies["refresh_token"]

    assert client.post("/api/auth/logout").status_code == 204

    # Replay the copy the attacker kept — the cookie jar is irrelevant to them.
    client.cookies.set("refresh_token", stolen_copy)
    assert client.post("/api/auth/refresh").status_code == 401


def test_refresh_rotates_the_token(client):
    """Each refresh must retire the token it consumed, so a leaked one is only
    useful until the victim's next refresh."""
    resp = client.post(
        "/api/auth/register", json={"email": "rot@example.com", "password": PASSWORD}
    )
    first = resp.cookies["refresh_token"]

    assert client.post("/api/auth/refresh").status_code == 200
    second = client.cookies["refresh_token"]
    assert second != first  # rotated

    # The spent token is dead.
    client.cookies.set("refresh_token", first)
    assert client.post("/api/auth/refresh").status_code == 401


def test_reusing_a_spent_token_revokes_the_whole_family(client):
    """Replay of a revoked jti means someone kept a copy. We can't tell the
    thief from the victim, so every token for that user dies and both must
    log in again."""
    resp = client.post(
        "/api/auth/register", json={"email": "reuse@example.com", "password": PASSWORD}
    )
    stolen = resp.cookies["refresh_token"]

    client.post("/api/auth/refresh")           # victim rotates; `stolen` is now spent
    victims_current = client.cookies["refresh_token"]

    client.cookies.set("refresh_token", stolen)  # attacker replays the old one
    assert client.post("/api/auth/refresh").status_code == 401

    # The victim's still-live token is now revoked too — that's the point.
    client.cookies.set("refresh_token", victims_current)
    assert client.post("/api/auth/refresh").status_code == 401


def test_unknown_jti_is_rejected(client, auth):
    """A validly-signed token whose jti was never issued (or was purged) must
    not work — the signature alone is not authority."""
    _, user = auth()
    forged, _jti = create_refresh_token(user["id"])  # signed, but never stored
    client.cookies.set("refresh_token", forged)
    assert client.post("/api/auth/refresh").status_code == 401


# --- rate limiting -----------------------------------------------------


def test_login_is_rate_limited(client):
    """Without this, the password is brute-forceable and argon2 (expensive by
    design) becomes a DoS lever."""
    client.post("/api/auth/register", json={"email": "bf@example.com", "password": PASSWORD})
    body = {"email": "bf@example.com", "password": "wrong-password"}

    codes = [client.post("/api/auth/login", json=body).status_code for _ in range(12)]
    assert 401 in codes          # the early attempts are real attempts
    assert codes[-1] == 429      # and then the door shuts
    assert codes.count(429) >= 2


def test_register_is_rate_limited(client):
    codes = [
        client.post(
            "/api/auth/register", json={"email": f"spam{i}@example.com", "password": PASSWORD}
        ).status_code
        for i in range(7)
    ]
    assert codes[-1] == 429


def test_rate_limited_response_tells_the_client_when_to_retry(client):
    for _ in range(11):
        resp = client.post(
            "/api/auth/login", json={"email": "x@example.com", "password": PASSWORD}
        )
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) > 0
