from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TaskSnapshot:
    in_progress: bool = False
    task_id: str | None = None
    stage: str | None = None
    message: str | None = None
    work_dir: str | None = None

    def as_status_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "schema": "ppt-maker-generation-status/v1",
            "in_progress": self.in_progress,
        }
        if self.task_id:
            payload["task_id"] = self.task_id
        if self.stage:
            payload["stage"] = self.stage
        if self.message:
            payload["message"] = self.message
        if self.work_dir:
            payload["work_dir"] = self.work_dir
        return payload
