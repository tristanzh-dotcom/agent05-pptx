from __future__ import annotations

import asyncio
from pathlib import Path
from threading import Lock

from backend.app.models import TaskSnapshot


class TaskManager:
    def __init__(self) -> None:
        self._lock = Lock()
        self._snapshot = TaskSnapshot()
        self._cancel_event: asyncio.Event | None = None

    def status(self) -> TaskSnapshot:
        with self._lock:
            return TaskSnapshot(
                in_progress=self._snapshot.in_progress,
                task_id=self._snapshot.task_id,
                stage=self._snapshot.stage,
                message=self._snapshot.message,
                work_dir=self._snapshot.work_dir,
            )

    def start(self, *, task_id: str, work_dir: Path, cancel_event: asyncio.Event | None = None) -> bool:
        with self._lock:
            if self._snapshot.in_progress:
                return False
            self._snapshot = TaskSnapshot(in_progress=True, task_id=task_id, stage="selecting_template", work_dir=str(work_dir))
            self._cancel_event = cancel_event
            return True

    def update(self, *, task_id: str, stage: str, message: str) -> None:
        with self._lock:
            if not self._snapshot.in_progress or self._snapshot.task_id != task_id:
                return
            self._snapshot.stage = stage
            self._snapshot.message = message

    def cancel(self) -> bool:
        with self._lock:
            if not self._snapshot.in_progress:
                return False
            if self._cancel_event is not None:
                self._cancel_event.set()
            self._snapshot = TaskSnapshot()
            self._cancel_event = None
            return True

    def finish(self, task_id: str) -> None:
        with self._lock:
            if self._snapshot.task_id == task_id:
                self._snapshot = TaskSnapshot()
                self._cancel_event = None
