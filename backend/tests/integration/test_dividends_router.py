from datetime import date
from decimal import Decimal

import pytest

from app.models.bank_account import BankAccount
from app.models.bank_connection import BankConnection
from app.models.dividend_event import DividendEvent
from app.models.transaction import Transaction


pytestmark = pytest.mark.integration


async def _make_dividend(db, *, user_id, payment_date, ticker="ITUB4", event_type="DIVIDEND"):
    conn = BankConnection(
        user_id=user_id, external_id=f"i-{ticker}-{payment_date}",
        institution_name="Bank", status="active",
    )
    db.add(conn)
    await db.flush()
    acct = BankAccount(
        user_id=user_id,
        connection_id=conn.id,
        external_id=f"a-{ticker}-{payment_date}",
        name="x",
        type="checking",
        balance=Decimal("0"),
    )
    db.add(acct)
    await db.flush()
    txn = Transaction(
        account_id=acct.id, user_id=user_id, external_id=f"e-{payment_date}-{ticker}",
        amount=Decimal("10"), date=payment_date, type="CREDIT",
    )
    db.add(txn)
    await db.flush()
    ev = DividendEvent(
        user_id=user_id,
        transaction_id=txn.id,
        ticker=ticker,
        event_type=event_type,
        credited_amount=Decimal("10"),
        payment_date=payment_date,
    )
    db.add(ev)
    await db.commit()
    return ev


async def test_list_empty(auth_client):
    r = await auth_client.get("/api/dividends")
    assert r.status_code == 200
    assert r.json() == {"events": [], "total_count": 0}


async def test_list_with_filters(auth_client, db, user):
    await _make_dividend(db, user_id=user.id, payment_date=date(2026, 1, 10), ticker="ITUB4")
    await _make_dividend(db, user_id=user.id, payment_date=date(2026, 5, 10), ticker="PETR4")

    r = await auth_client.get("/api/dividends?year=2026&month=5")
    body = r.json()
    assert body["total_count"] == 1
    assert body["events"][0]["ticker"] == "PETR4"

    r2 = await auth_client.get("/api/dividends?ticker=itub4")
    assert r2.json()["total_count"] == 1


async def test_list_filter_event_type(auth_client, db, user):
    await _make_dividend(
        db, user_id=user.id, payment_date=date(2026, 1, 1),
        ticker="A", event_type="DIVIDEND",
    )
    await _make_dividend(
        db, user_id=user.id, payment_date=date(2026, 1, 1),
        ticker="B", event_type="JCP",
    )
    r = await auth_client.get("/api/dividends?event_type=jcp")
    assert r.json()["total_count"] == 1
