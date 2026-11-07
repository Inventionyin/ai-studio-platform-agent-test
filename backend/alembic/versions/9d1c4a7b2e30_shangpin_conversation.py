"""shangpin conversation fields

Revision ID: 9d1c4a7b2e30
Revises: 7b3f9c2d4e11
Create Date: 2026-11-07 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "9d1c4a7b2e30"
down_revision: Union[str, Sequence[str], None] = "7b3f9c2d4e11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add multi-turn inputs and conversation snapshots."""
    op.add_column(
        "agent_test_cases",
        sa.Column(
            "turns",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "agent_runs",
        sa.Column(
            "conversation",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    """Drop multi-turn fields."""
    op.drop_column("agent_runs", "conversation")
    op.drop_column("agent_test_cases", "turns")
