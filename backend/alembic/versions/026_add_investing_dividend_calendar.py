"""add investing dividend calendar fields

Revision ID: 026_add_investing_dividend_calendar
Revises: 025_add_notifications
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa


revision = "026_add_investing_dividend_calendar"
down_revision = "025_add_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assets", sa.Column("investing_instrument_id", sa.Integer(), nullable=True)
    )
    op.add_column(
        "assets",
        sa.Column("investing_instrument_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "assets", sa.Column("investing_exchange", sa.String(length=80), nullable=True)
    )
    op.add_column(
        "assets", sa.Column("investing_resolved_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "assets",
        sa.Column("investing_resolution_status", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("investing_resolution_error", sa.String(length=500), nullable=True),
    )
    op.create_index(
        op.f("ix_assets_investing_instrument_id"),
        "assets",
        ["investing_instrument_id"],
        unique=False,
    )

    op.drop_constraint(
        "uq_dividend_event_transaction", "dividend_events", type_="unique"
    )
    op.alter_column(
        "dividend_events",
        "transaction_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.create_unique_constraint(
        "uq_dividend_event_transaction",
        "dividend_events",
        ["transaction_id"],
    )

    op.add_column(
        "dividend_events",
        sa.Column(
            "source",
            sa.String(length=30),
            nullable=False,
            server_default="BANK_TRANSACTION",
        ),
    )
    op.add_column(
        "dividend_events",
        sa.Column(
            "status", sa.String(length=30), nullable=False, server_default="CONFIRMED"
        ),
    )
    op.add_column(
        "dividend_events",
        sa.Column("source_event_key", sa.String(length=255), nullable=True),
    )
    op.add_column("dividend_events", sa.Column("ex_date", sa.Date(), nullable=True))
    op.add_column(
        "dividend_events",
        sa.Column("declared_currency", sa.String(length=3), nullable=True),
    )
    op.add_column(
        "dividend_events",
        sa.Column("amount_per_unit_native", sa.Numeric(18, 8), nullable=True),
    )
    op.add_column(
        "dividend_events",
        sa.Column("gross_amount_native", sa.Numeric(18, 4), nullable=True),
    )
    op.add_column(
        "dividend_events",
        sa.Column("withholding_tax_native", sa.Numeric(18, 4), nullable=True),
    )
    op.add_column(
        "dividend_events",
        sa.Column("credited_amount_native", sa.Numeric(18, 4), nullable=True),
    )
    op.add_column(
        "dividend_events", sa.Column("fx_rate_to_brl", sa.Numeric(18, 6), nullable=True)
    )
    op.create_index(
        op.f("ix_dividend_events_source"), "dividend_events", ["source"], unique=False
    )
    op.create_index(
        op.f("ix_dividend_events_status"), "dividend_events", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_dividend_events_ex_date"), "dividend_events", ["ex_date"], unique=False
    )
    op.create_unique_constraint(
        "uq_dividend_event_source_key",
        "dividend_events",
        ["user_id", "asset_id", "source", "source_event_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_dividend_event_source_key", "dividend_events", type_="unique"
    )
    op.drop_index(op.f("ix_dividend_events_ex_date"), table_name="dividend_events")
    op.drop_index(op.f("ix_dividend_events_status"), table_name="dividend_events")
    op.drop_index(op.f("ix_dividend_events_source"), table_name="dividend_events")
    op.drop_column("dividend_events", "fx_rate_to_brl")
    op.drop_column("dividend_events", "credited_amount_native")
    op.drop_column("dividend_events", "withholding_tax_native")
    op.drop_column("dividend_events", "gross_amount_native")
    op.drop_column("dividend_events", "amount_per_unit_native")
    op.drop_column("dividend_events", "declared_currency")
    op.drop_column("dividend_events", "ex_date")
    op.drop_column("dividend_events", "source_event_key")
    op.drop_column("dividend_events", "status")
    op.drop_column("dividend_events", "source")
    op.drop_constraint(
        "uq_dividend_event_transaction", "dividend_events", type_="unique"
    )
    op.alter_column(
        "dividend_events",
        "transaction_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_unique_constraint(
        "uq_dividend_event_transaction",
        "dividend_events",
        ["transaction_id"],
    )

    op.drop_index(op.f("ix_assets_investing_instrument_id"), table_name="assets")
    op.drop_column("assets", "investing_resolution_error")
    op.drop_column("assets", "investing_resolution_status")
    op.drop_column("assets", "investing_resolved_at")
    op.drop_column("assets", "investing_exchange")
    op.drop_column("assets", "investing_instrument_name")
    op.drop_column("assets", "investing_instrument_id")
