from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from .db import SessionLocal
from .models import Document


class Store:
    """JSONB document store for flexible domain data. Relational data lives in models.py."""

    def all(self, collection: str, project_id: str | None = None) -> list[dict[str, Any]]:
        with SessionLocal() as db:
            rows = db.scalars(
                select(Document).where(Document.collection == collection).order_by(Document.seq)
            ).all()
        items = [row.data for row in rows]
        if project_id is not None:
            items = [item for item in items if item.get("projectId") == project_id]
        return items

    def get(self, collection: str, doc_id: str, project_id: str | None = None) -> dict[str, Any] | None:
        with SessionLocal() as db:
            row = db.get(Document, (collection, str(doc_id)))
        if not row:
            return None
        if project_id is not None and row.data.get("projectId") != project_id:
            return None
        return row.data

    def put(self, collection: str, doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
        with SessionLocal() as db:
            row = db.get(Document, (collection, str(doc_id)))
            if row:
                row.data = data
            else:
                max_seq = db.scalar(
                    select(func.coalesce(func.max(Document.seq), 0)).where(Document.collection == collection)
                )
                db.add(Document(collection=collection, doc_id=str(doc_id), seq=int(max_seq or 0) + 1, data=data))
            db.commit()
        return data

    def delete(self, collection: str, doc_id: str) -> None:
        with SessionLocal() as db:
            row = db.get(Document, (collection, str(doc_id)))
            if row:
                db.delete(row)
                db.commit()

    def count(self, collection: str, project_id: str | None = None) -> int:
        return len(self.all(collection, project_id))

    def replace(
        self,
        collection: str,
        items: list[dict[str, Any]],
        id_key: str = "id",
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:
        with SessionLocal() as db:
            rows = db.scalars(select(Document).where(Document.collection == collection)).all()
            for row in rows:
                if project_id is None or row.data.get("projectId") == project_id:
                    db.delete(row)
            db.commit()
        for index, item in enumerate(items, start=1):
            if project_id is not None:
                item.setdefault("projectId", project_id)
            doc_id = str(item.get(id_key) or index)
            self.put(collection, doc_id, item)
        return items

    def single(self, collection: str, default: Any = None) -> Any:
        doc = self.get(collection, "default")
        return doc.get("value", default) if doc else default

    def set_single(self, collection: str, value: Any) -> Any:
        self.put(collection, "default", {"value": value})
        return value


store = Store()
