"""agent test/real data separation

Revision ID: a1f2b3c4d5e6
Revises: 9d1c4a7b2e30
Create Date: 2026-11-08 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1f2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "9d1c4a7b2e30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_conversations",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("project_id", sa.String(length=40), nullable=False),
        sa.Column("target_id", sa.String(length=40), nullable=False),
        sa.Column("source_type", sa.String(length=20), nullable=False, server_default="production"),
        sa.Column("environment", sa.String(length=20), nullable=False, server_default="prod"),
        sa.Column("external_session_id", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("customer_ref", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("channel", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=30), nullable=False, server_default=""),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("pii_masked", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["agent_targets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "target_id", "source_type", "external_session_id",
                            name="uq_agent_conversation_external"),
    )
    op.create_index("ix_agent_conversations_project_id", "agent_conversations", ["project_id"])
    op.create_index("ix_agent_conversations_target_id", "agent_conversations", ["target_id"])
    op.create_index("ix_agent_conversations_source_type", "agent_conversations", ["source_type"])

    op.create_table(
        "agent_ingest_events",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("source", sa.String(length=30), nullable=False, server_default="shangpin"),
        sa.Column("event_id", sa.String(length=80), nullable=False),
        sa.Column("event_type", sa.String(length=60), nullable=False, server_default=""),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="processed"),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "event_id", name="uq_agent_ingest_event"),
    )
    op.create_index("ix_agent_ingest_events_event_id", "agent_ingest_events", ["event_id"])

    op.add_column("agent_runs", sa.Column("conversation_id", sa.String(length=40), nullable=True))
    op.add_column("agent_runs", sa.Column("source_type", sa.String(length=20), nullable=False,
                                          server_default="ai_test"))
    op.add_column("agent_runs", sa.Column("environment", sa.String(length=20), nullable=False,
                                          server_default="test"))
    op.add_column("agent_runs", sa.Column("external_session_id", sa.String(length=80), nullable=False,
                                          server_default=""))
    op.add_column("agent_runs", sa.Column("external_run_id", sa.String(length=80), nullable=False,
                                          server_default=""))
    op.add_column("agent_runs", sa.Column("external_message_id", sa.String(length=80), nullable=False,
                                          server_default=""))
    op.add_column("agent_runs", sa.Column("dataset_version", sa.String(length=40), nullable=False,
                                          server_default=""))
    op.add_column("agent_runs", sa.Column("is_test", sa.Boolean(), nullable=False,
                                          server_default=sa.text("true")))
    op.add_column("agent_runs", sa.Column("pii_masked", sa.Boolean(), nullable=False,
                                          server_default=sa.text("true")))
    op.add_column("agent_runs", sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                                          server_default=sa.text("'{}'::jsonb")))
    op.add_column("agent_runs", sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("agent_runs", "case_id", existing_type=sa.String(length=40), nullable=True)
    op.create_foreign_key(
        "fk_agent_runs_conversation", "agent_runs", "agent_conversations",
        ["conversation_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_agent_runs_conversation_id", "agent_runs", ["conversation_id"])
    op.create_index("ix_agent_runs_source_type", "agent_runs", ["source_type"])
    op.create_index("ix_agent_runs_external_run", "agent_runs", ["target_id", "external_run_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_runs_external_run", table_name="agent_runs")
    op.drop_index("ix_agent_runs_source_type", table_name="agent_runs")
    op.drop_index("ix_agent_runs_conversation_id", table_name="agent_runs")
    op.drop_constraint("fk_agent_runs_conversation", "agent_runs", type_="foreignkey")
    op.alter_column("agent_runs", "case_id", existing_type=sa.String(length=40), nullable=False)
    for column in (
        "ingested_at", "metadata", "pii_masked", "is_test", "dataset_version",
        "external_message_id", "external_run_id", "external_session_id",
        "environment", "source_type", "conversation_id",
    ):
        op.drop_column("agent_runs", column)
    op.drop_index("ix_agent_ingest_events_event_id", table_name="agent_ingest_events")
    op.drop_table("agent_ingest_events")
    op.drop_index("ix_agent_conversations_source_type", table_name="agent_conversations")
    op.drop_index("ix_agent_conversations_target_id", table_name="agent_conversations")
    op.drop_index("ix_agent_conversations_project_id", table_name="agent_conversations")
    op.drop_table("agent_conversations")
