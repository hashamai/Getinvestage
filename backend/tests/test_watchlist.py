"""Watchlist: auth gating, per-user isolation, and the duplicate/limit edges.

The isolation test is the one that matters: a bug there leaks one user's data
to another, which is the worst failure this app can have.
"""

from __future__ import annotations

from api.watchlist import MAX_SYMBOLS


def test_watchlist_requires_auth(client):
    assert client.get("/api/watchlist").status_code == 401
    assert client.post("/api/watchlist", json={"symbol": "AAPL"}).status_code == 401
    assert client.delete("/api/watchlist/AAPL").status_code == 401


def test_new_user_has_an_empty_watchlist(client, auth):
    headers, _ = auth()
    resp = client.get("/api/watchlist", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_then_list(client, auth):
    headers, _ = auth()
    resp = client.post("/api/watchlist", json={"symbol": "AAPL"}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["symbol"] == "AAPL"

    assert [i["symbol"] for i in client.get("/api/watchlist", headers=headers).json()] == ["AAPL"]


def test_symbol_is_normalized_to_uppercase(client, auth):
    headers, _ = auth()
    resp = client.post("/api/watchlist", json={"symbol": "  nvda "}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["symbol"] == "NVDA"


def test_duplicate_symbol_is_rejected(client, auth):
    """A double-click must not create two rows — the DB unique constraint,
    not just the route, is what guarantees this."""
    headers, _ = auth()
    assert client.post("/api/watchlist", json={"symbol": "TSLA"}, headers=headers).status_code == 201
    resp = client.post("/api/watchlist", json={"symbol": "tsla"}, headers=headers)
    assert resp.status_code == 409
    assert len(client.get("/api/watchlist", headers=headers).json()) == 1


def test_remove_symbol(client, auth):
    headers, _ = auth()
    client.post("/api/watchlist", json={"symbol": "AMD"}, headers=headers)
    assert client.delete("/api/watchlist/AMD", headers=headers).status_code == 204
    assert client.get("/api/watchlist", headers=headers).json() == []


def test_remove_symbol_that_is_not_there(client, auth):
    headers, _ = auth()
    assert client.delete("/api/watchlist/GOOGL", headers=headers).status_code == 404


def test_blank_symbol_is_rejected(client, auth):
    headers, _ = auth()
    assert client.post("/api/watchlist", json={"symbol": "   "}, headers=headers).status_code == 422


def test_watchlist_is_isolated_between_users(client, auth):
    """Alice must never see, and must never be able to delete, Bob's rows."""
    alice, _ = auth("alice@example.com")
    bob, _ = auth("bob@example.com")

    client.post("/api/watchlist", json={"symbol": "AAPL"}, headers=alice)
    client.post("/api/watchlist", json={"symbol": "NVDA"}, headers=bob)

    assert [i["symbol"] for i in client.get("/api/watchlist", headers=alice).json()] == ["AAPL"]
    assert [i["symbol"] for i in client.get("/api/watchlist", headers=bob).json()] == ["NVDA"]

    # Alice deleting "NVDA" must 404 (it isn't hers) and must not touch Bob's row.
    assert client.delete("/api/watchlist/NVDA", headers=alice).status_code == 404
    assert [i["symbol"] for i in client.get("/api/watchlist", headers=bob).json()] == ["NVDA"]


def test_same_symbol_can_be_held_by_two_users(client, auth):
    """The unique constraint is (user_id, symbol) — not symbol alone."""
    alice, _ = auth("alice@example.com")
    bob, _ = auth("bob@example.com")
    assert client.post("/api/watchlist", json={"symbol": "AAPL"}, headers=alice).status_code == 201
    assert client.post("/api/watchlist", json={"symbol": "AAPL"}, headers=bob).status_code == 201


def test_watchlist_is_capped(client, auth):
    headers, _ = auth()
    for i in range(MAX_SYMBOLS):
        resp = client.post("/api/watchlist", json={"symbol": f"SYM{i}"}, headers=headers)
        assert resp.status_code == 201
    resp = client.post("/api/watchlist", json={"symbol": "OVER"}, headers=headers)
    assert resp.status_code == 409
