from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from src.database import Base


def test_atomic_credit_balance_migration_upgrades_previous_revision(tmp_path):
    database = tmp_path / "migration.sqlite"
    url = f"sqlite:///{database}"
    engine = create_engine(url)
    previous_tables = [
        table
        for name, table in Base.metadata.tables.items()
        if name != "ai_credit_balances"
    ]
    Base.metadata.create_all(engine, tables=previous_tables)

    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    command.stamp(config, "104d0685c008")
    command.upgrade(config, "head")

    inspector = inspect(engine)
    assert "ai_credit_balances" in inspector.get_table_names()
    assert {
        "bucket_key",
        "user_id",
        "ip_hash",
        "period_start",
        "period_end",
        "period_limit",
        "used",
        "updated_at",
    } == {column["name"] for column in inspector.get_columns("ai_credit_balances")}
    engine.dispose()
