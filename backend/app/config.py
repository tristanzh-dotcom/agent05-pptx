from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


DEFAULT_PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SKILLS_ROOT = DEFAULT_PROJECT_ROOT.parent / ".ai_skills"


@dataclass(frozen=True)
class AppSettings:
    project_root: Path = DEFAULT_PROJECT_ROOT
    ppt_maker_root: Path = DEFAULT_SKILLS_ROOT / "ppt-maker"
    gorden_root: Path = DEFAULT_SKILLS_ROOT / "gorden-ppt-skill"
    max_upload_bytes: int = 50 * 1024 * 1024
    task_timeout_seconds: float = 600.0
    template_selection_timeout_seconds: float = 60.0
    opencode_bin: Path = Path("/Users/tristanzh/.opencode/bin/opencode")

    @property
    def work_root(self) -> Path:
        return self.project_root / "work" / "ppt-maker"

    @property
    def frontend_dist(self) -> Path:
        return self.project_root / "frontend" / "dist"

    @property
    def validate_script(self) -> Path:
        return self.ppt_maker_root / "scripts" / "validate_ppt_request.py"

    @property
    def analyzer_script(self) -> Path:
        return self.ppt_maker_root / "scripts" / "pptx_analyzer.py"

    @property
    def build_script(self) -> Path:
        return self.gorden_root / "scripts" / "build_pptx.py"

    @property
    def render_script(self) -> Path:
        return self.gorden_root / "scripts" / "render_slides.py"

    @property
    def templates_index(self) -> Path:
        return self.gorden_root / "templates" / "INDEX.md"
