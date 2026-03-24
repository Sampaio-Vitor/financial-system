"""add expenses tables (pluggy_credentials, bank_connections, bank_accounts, transactions)

Revision ID: 005_add_expenses_tables
Revises: 004_add_user_assets
Create Date: 2026-03-24
"""
import sqlalchemy as sa
from alembic import op

revision = "005_add_expenses_tables"
down_revision = "004_add_user_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. pluggy_credentials
    op.create_table(
        "pluggy_credentials",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("encrypted_client_id", sa.LargeBinary(512), nullable=False),
        sa.Column("encrypted_client_secret", sa.LargeBinary(512), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_pluggy_credentials_user_id", "pluggy_credentials", ["user_id"])

    # 2. bank_connections
    op.create_table(
        "bank_connections",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("institution_name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("last_sync_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_bank_connections_user_id", "bank_connections", ["user_id"])

    # 3. bank_accounts
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("connection_id", sa.Integer, sa.ForeignKey("bank_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(50), nullable=False, server_default="checking"),
        sa.Column("balance", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="BRL"),
        sa.Column("created_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_bank_accounts_connection_id", "bank_accounts", ["connection_id"])
    op.create_index("ix_bank_accounts_user_id", "bank_accounts", ["user_id"])

    # 4. transactions
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, sa.ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("type", sa.String(10), nullable=False),
        sa.Column("category", sa.String(100), nullable=False, server_default="Outros"),
        sa.Column("pluggy_category", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="posted"),
        sa.Column("raw_data", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("account_id", "external_id", name="uq_transaction_account_external"),
    )
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.create_index("ix_transactions_user_date", "transactions", ["user_id", "date"])


def downgrade() -> None:
    op.drop_index("ix_transactions_user_date", "transactions")
    op.drop_index("ix_transactions_date", "transactions")
    op.drop_index("ix_transactions_user_id", "transactions")
    op.drop_index("ix_transactions_account_id", "transactions")
    op.drop_table("transactions")

    op.drop_index("ix_bank_accounts_user_id", "bank_accounts")
    op.drop_index("ix_bank_accounts_connection_id", "bank_accounts")
    op.drop_table("bank_accounts")

    op.drop_index("ix_bank_connections_user_id", "bank_connections")
    op.drop_table("bank_connections")

    op.drop_index("ix_pluggy_credentials_user_id", "pluggy_credentials")
    op.drop_table("pluggy_credentials")
