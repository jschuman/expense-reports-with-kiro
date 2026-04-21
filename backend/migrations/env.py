"""Alembic environment configuration for the Expense Report Web App.

This file is loaded by Alembic when running migration commands such as
``alembic upgrade head`` or ``alembic revision --autogenerate``.

It configures two migration modes:
- **Offline mode** (``run_migrations_offline``): generates SQL scripts without
  a live database connection.
- **Online mode** (``run_migrations_online``): connects to the database and
  applies migrations directly.

The ``target_metadata`` variable must point to the SQLAlchemy ``Base.metadata``
object so that ``--autogenerate`` can compare the current schema against the
ORM models and produce accurate migration scripts.
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# ---------------------------------------------------------------------------
# Alembic Config object — provides access to values in alembic.ini
# ---------------------------------------------------------------------------
config = context.config

# Interpret the config file for Python logging if present.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Import the application's Base metadata so autogenerate can detect changes.
# This import will work once backend/app/db/database.py is implemented.
# ---------------------------------------------------------------------------
try:
    from app.db.database import Base  # noqa: F401 — imported for side-effects
    target_metadata = Base.metadata
except ImportError:
    # During initial scaffolding the app package may not yet be importable.
    # Autogenerate will not detect model changes until this import succeeds.
    target_metadata = None


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    In this mode Alembic configures the context with just a URL (no Engine
    is created). Calls to ``context.execute()`` emit the SQL to the script
    output rather than executing it against a live database.

    This is useful for generating migration SQL to review or apply manually.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this mode an Engine is created and a connection is associated with the
    migration context. Migrations are applied directly to the database.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
