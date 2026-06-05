from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable

from backend.app.config import AppSettings
from backend.app.routers.health import render_dependencies_available
from backend.app.services.files import relative_posix
from backend.app.services.validate_edits import validate_edits


ProgressCallback = Callable[[str, str], Awaitable[None]]


class GenerationError(RuntimeError):
    pass


@dataclass(frozen=True)
class GenerationRequest:
    prompt: str
    page_count: int | None
    style: str | None
    template_slug: str | None
    purpose: str | None = None
    custom_template_path: str | None = None
    mode: str = "prompt_to_ppt"
    source_pptx_path: str | None = None
    reference_analysis: dict[str, object] | None = None


@dataclass
class GenerationContext:
    task_id: str
    work_dir: Path
    cancel_event: asyncio.Event


class SubprocessGenerationRunner:
    def __init__(self, settings: AppSettings) -> None:
        self.settings = settings

    async def run(
        self,
        request: GenerationRequest,
        context: GenerationContext,
        progress: ProgressCallback,
    ) -> dict[str, object]:
        if request.mode == "prompt_to_ppt":
            return await self._run_prompt_to_ppt(request, context, progress)
        if request.mode == "template_preserving_edit":
            return await self._run_template_preserving_edit(request, context, progress)
        raise GenerationError(f"unknown generation mode: {request.mode}")

    async def _run_prompt_to_ppt(
        self,
        request: GenerationRequest,
        context: GenerationContext,
        progress: ProgressCallback,
    ) -> dict[str, object]:
        if request.page_count is None:
            raise GenerationError("page_count required for prompt_to_ppt")
        if not request.template_slug:
            raise GenerationError("template_slug required for prompt_to_ppt")
        context.work_dir.mkdir(parents=True, exist_ok=True)
        await self._run_command(
            [
                *self._command_prefix(self.settings.validate_script),
                "--mode",
                "prompt_to_ppt",
                "--gorden-root",
                str(self.settings.gorden_root),
            ],
            context=context,
            cwd=context.work_dir,
            label="validate_ppt_request.py",
        )

        await progress("generating_outline", "正在生成大纲...")
        template_context_dir = self._prepare_template_context(request, context.work_dir)
        orchestration_prompt = self._write_orchestration_prompt(request, context.work_dir, template_context_dir)
        await self._run_command(
            [
                *self._command_prefix(self.settings.opencode_bin),
                "run",
                "--dir",
                str(context.work_dir),
                orchestration_prompt.read_text(encoding="utf-8"),
            ],
            context=context,
            cwd=context.work_dir,
            label="opencode run",
        )

        edits = context.work_dir / "edits.json"
        if not edits.exists():
            raise GenerationError("opencode did not produce edits.json")

        await progress("building_pptx", "正在构建 PPTX...")
        template_dir = self.settings.gorden_root / "templates" / request.template_slug
        output = context.work_dir / "output.pptx"
        await self._run_command(
            [
                *self._command_prefix(self.settings.build_script),
                str(template_dir / "template.pptx"),
                str(edits),
                str(output),
                "--detail",
                str(template_dir / "detail.json"),
                "--strict",
            ],
            context=context,
            cwd=context.work_dir,
            label="build_pptx.py",
        )

        edits_content = json.loads(edits.read_text(encoding="utf-8"))
        quality_check = validate_edits(edits_content, request.page_count)
        if not quality_check["valid"]:
            raise GenerationError(json.dumps(quality_check, ensure_ascii=False))

        preview_path = context.work_dir / "machine_extracted.json"
        await self._run_command(
            [
                *self._command_prefix(self.settings.analyzer_script),
                "--mode",
                "extract",
                str(output),
                "--output",
                str(preview_path),
            ],
            context=context,
            cwd=context.work_dir,
            label="pptx_analyzer.py",
        )

        if render_dependencies_available() and self.settings.render_script.exists():
            await self._run_command(
                [
                    *self._command_prefix(self.settings.render_script),
                    str(output),
                    str(context.work_dir / "rendered"),
                ],
                context=context,
                cwd=context.work_dir,
                label="render_slides.py",
            )

        preview = json.loads(preview_path.read_text(encoding="utf-8"))
        await progress("quality_check", "质检完成")
        return {
            "file_name": output.name,
            "file_id": relative_posix(output, self.settings.work_root),
            "preview": preview,
            "task_dir": context.work_dir.name,
        }

    async def _run_template_preserving_edit(
        self,
        request: GenerationRequest,
        context: GenerationContext,
        progress: ProgressCallback,
    ) -> dict[str, object]:
        context.work_dir.mkdir(parents=True, exist_ok=True)
        source = self._resolve_source_pptx(request.source_pptx_path)
        work_source = context.work_dir / "source.pptx"
        shutil.copyfile(source, work_source)

        await progress("analyzing_source", "正在分析源文件...")
        await self._run_command(
            [
                *self._command_prefix(self.settings.validate_script),
                "--mode",
                "template_preserving_edit",
                "--gorden-root",
                str(self.settings.gorden_root),
                "--source-pptx",
                str(work_source),
            ],
            context=context,
            cwd=context.work_dir,
            label="validate_ppt_request.py",
        )

        source_extract = context.work_dir / "source_machine_extracted.json"
        await self._run_command(
            [
                *self._command_prefix(self.settings.analyzer_script),
                "--mode",
                "extract",
                str(work_source),
                "--output",
                str(source_extract),
            ],
            context=context,
            cwd=context.work_dir,
            label="pptx_analyzer.py",
        )

        await progress("editing_pptx", "正在编辑内容...")
        orchestration_prompt = self._write_mode_b_orchestration_prompt(request, context.work_dir, source_extract)
        await self._run_command(
            [
                *self._command_prefix(self.settings.opencode_bin),
                "run",
                "--dir",
                str(context.work_dir),
                orchestration_prompt.read_text(encoding="utf-8"),
            ],
            context=context,
            cwd=context.work_dir,
            label="opencode run",
        )

        edits = context.work_dir / "edits.json"
        if not edits.exists():
            raise GenerationError("opencode did not produce edits.json")

        edits_content = json.loads(edits.read_text(encoding="utf-8"))
        self._validate_mode_b_explicit_addresses(edits_content)

        output = context.work_dir / "output.pptx"
        await self._run_command(
            [
                *self._command_prefix(self.settings.build_script),
                str(work_source),
                str(edits),
                str(output),
                "--strict",
            ],
            context=context,
            cwd=context.work_dir,
            label="build_pptx.py",
        )

        quality_check = validate_edits(edits_content, page_count=None)
        if not quality_check["valid"]:
            raise GenerationError(json.dumps(quality_check, ensure_ascii=False))

        preview_path = context.work_dir / "machine_extracted.json"
        await self._run_command(
            [
                *self._command_prefix(self.settings.analyzer_script),
                "--mode",
                "extract",
                str(output),
                "--output",
                str(preview_path),
            ],
            context=context,
            cwd=context.work_dir,
            label="pptx_analyzer.py",
        )

        if render_dependencies_available() and self.settings.render_script.exists():
            await self._run_command(
                [
                    *self._command_prefix(self.settings.render_script),
                    str(output),
                    str(context.work_dir / "rendered"),
                ],
                context=context,
                cwd=context.work_dir,
                label="render_slides.py",
            )

        preview = json.loads(preview_path.read_text(encoding="utf-8"))
        await progress("quality_check", "质检完成")
        return {
            "file_name": output.name,
            "file_id": relative_posix(output, self.settings.work_root),
            "preview": preview,
            "task_dir": context.work_dir.name,
        }

    def _prepare_template_context(self, request: GenerationRequest, work_dir: Path) -> Path:
        template_dir = self.settings.gorden_root / "templates" / request.template_slug
        context_dir = work_dir / "template_context"
        context_dir.mkdir(parents=True, exist_ok=True)
        for file_name in ("detail.json", "intro.md"):
            source = template_dir / file_name
            if not source.exists():
                raise GenerationError(f"template context missing required file: {source}")
            shutil.copyfile(source, context_dir / file_name)
        return context_dir

    def _write_orchestration_prompt(self, request: GenerationRequest, work_dir: Path, template_context_dir: Path) -> Path:
        if request.page_count is None:
            raise GenerationError("page_count required for prompt_to_ppt")
        path = work_dir / "orchestration_prompt.md"
        relative_context = template_context_dir.relative_to(work_dir).as_posix()
        reference_prompt_enhancement = self._build_reference_prompt_enhancement(request.reference_analysis)
        effective_prompt = request.prompt if not reference_prompt_enhancement else f"{request.prompt}\n\n{reference_prompt_enhancement}"
        payload = {
            "prompt": effective_prompt,
            "user_prompt": request.prompt,
            "page_count": request.page_count,
            "style": request.style,
            "purpose": request.purpose,
            "template_slug": request.template_slug,
            "template_context": f"./{relative_context}",
            "template_detail": f"./{relative_context}/detail.json",
            "template_intro": f"./{relative_context}/intro.md",
            "reference_prompt_enhancement": reference_prompt_enhancement,
            "output_edits_json": "./edits.json",
        }
        path.write_text(
            "你是 ppt-maker 的非交互编排器。请只在当前工作目录生成 edits.json，"
            "格式必须符合 gorden build_pptx.py 的 EDITS JSON SCHEMA。"
            "模板上下文已快照到当前工作目录的 ./template_context/，不要读取工作目录之外的模板文件。\n\n"
            "## 硬性约束 (违反以下任一规则将导致产出被拒绝)\n\n"
            f"1. selected_slides 长度不得超过 {request.page_count + 1}。如果你选了过多页面，优先去掉内容最弱的页。\n"
            "2. 不得输出以下占位文案：Question 1, Question 2, Vivamus, Lorem ipsum, 项目名称, "
            "请输入标题, 请输入内容, Your Title Here, 项目概述\n"
            "3. 每个幻灯片的每一个可编辑 text slot 都必须用真实内容填充，不得保留模板原文字。\n"
            "4. edits 数组的每个元素必须包含 slide (整数), slot_id (字符串), new_text (字符串)。\n\n"
            "你必须把最终 JSON 写入 output_edits_json 指定的路径 ./edits.json。\n"
            "不得写入工作目录之外的任何路径；只有当前任务工作目录下的 ./edits.json 会被后端读取。\n\n"
            + json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return path

    def _build_reference_prompt_enhancement(self, reference_analysis: dict[str, object] | None) -> str:
        if not isinstance(reference_analysis, dict):
            return ""
        file_type = str(reference_analysis.get("file_type") or "").strip()
        if not file_type or file_type == "pptx":
            return ""
        page_count = reference_analysis.get("page_count")
        page_suffix = f"（{page_count} 页）" if isinstance(page_count, int) else ""
        extracted_text = str(reference_analysis.get("extracted_text") or "").strip()
        text_summary = extracted_text[:500]
        colors = [str(color) for color in reference_analysis.get("dominant_colors") or [] if isinstance(color, str)]
        color_style_hint = str(reference_analysis.get("color_style_hint") or "").strip()
        recommended = [
            str(slug)
            for slug in reference_analysis.get("recommended_templates") or []
            if isinstance(slug, str) and slug
        ][:3]
        lines = [
            "## 参考文件分析",
            "",
            f"文件类型：{file_type}{page_suffix}",
        ]
        if text_summary:
            lines.append(f"提取文本摘要：{text_summary}")
        if colors:
            lines.append(f"主色调：{', '.join(colors)}")
        if color_style_hint:
            lines.append(f"风格建议：{color_style_hint}")
        if recommended:
            lines.append(f"配色匹配 Gorden 模板：{', '.join(recommended)}")
        return "\n".join(lines)

    def _write_mode_b_orchestration_prompt(self, request: GenerationRequest, work_dir: Path, source_extract: Path) -> Path:
        path = work_dir / "orchestration_prompt.md"
        machine_extracted = json.loads(source_extract.read_text(encoding="utf-8"))
        address_table = self._shape_address_table(machine_extracted)
        payload = {
            "mode": "template_preserving_edit",
            "prompt": request.prompt,
            "source_pptx": "./source.pptx",
            "source_machine_extracted": "./source_machine_extracted.json",
            "shape_address_table": address_table,
            "output_edits_json": "./edits.json",
        }
        path.write_text(
            "你是 ppt-maker 的非交互编排器。\n\n"
            "任务：基于对源 PPTX 的分析结果，生成 explicit-address edits.json，"
            "用于保留排版的前提下修改文字内容。\n\n"
            f"用户指令：{request.prompt}\n\n"
            "## 硬性约束\n\n"
            "1. 必须使用 explicit address 格式。每个 edit 含 address: {shape_id, paragraph, run}。\n"
            "2. 绝对不能使用 slot_id，源文件没有 detail.json。\n"
            "3. 只改文字，不改字体、字号、颜色、位置、形状大小。\n"
            "4. 原始 PPTX 文件不可修改。你只生成 ./edits.json。\n"
            "5. 只能使用下方 machine_extracted.json 地址表中真实存在的 shape_id/paragraph/run。\n"
            "6. 不得保留 Question 1、Question 2、Vivamus、Lorem ipsum、项目名称、请输入标题、"
            "请输入内容、Your Title Here、Add Your Text、项目概述 等占位文案。\n\n"
            "## edits.json 格式\n\n"
            "{\n"
            '  "selected_slides": [1, 2, 3],\n'
            '  "edits": [\n'
            '    {"slide": 1, "address": {"shape_id": 12, "paragraph": 0, "run": 0}, "new_text": "新文字"}\n'
            "  ]\n"
            "}\n\n"
            "请只在当前工作目录生成 ./edits.json。\n\n"
            "## machine_extracted.json 地址表\n\n"
            + json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return path

    def _shape_address_table(self, machine_extracted: dict[str, object]) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        slides = machine_extracted.get("slides")
        if isinstance(slides, list):
            for slide in slides:
                if not isinstance(slide, dict):
                    continue
                slide_number = slide.get("slide_number")
                texts = slide.get("texts")
                if not isinstance(texts, list):
                    continue
                for text in texts:
                    if not isinstance(text, dict):
                        continue
                    rows.append(self._address_row(slide_number, text))
        root_texts = machine_extracted.get("texts")
        if not rows and isinstance(root_texts, list):
            for text in root_texts:
                if isinstance(text, dict):
                    rows.append(self._address_row(text.get("slide"), text))
        return rows

    def _address_row(self, slide_number: object, text: dict[str, object]) -> dict[str, object]:
        row = {
            "slide": slide_number,
            "shape_id": text.get("shape_id"),
            "paragraph": text.get("paragraph", 0),
            "run": text.get("run", 0),
            "text": text.get("text", ""),
        }
        for field in ("left", "top", "width", "height", "font_size_pt"):
            if field in text:
                row[field] = text[field]
        return row

    def _validate_mode_b_explicit_addresses(self, edits_content: dict[str, object]) -> None:
        edits = edits_content.get("edits") if isinstance(edits_content, dict) else None
        if not isinstance(edits, list):
            raise GenerationError("Mode B edits must contain edits array")
        errors: list[str] = []
        for index, edit in enumerate(edits):
            if not isinstance(edit, dict):
                errors.append(f"edits[{index}] must be an object")
                continue
            if "slot_id" in edit:
                errors.append(f"edits[{index}] must use address, not slot_id")
            address = edit.get("address")
            if not isinstance(address, dict):
                errors.append(f"edits[{index}] missing explicit address")
                continue
            if not self._is_positive_int(address.get("shape_id")):
                errors.append(f"edits[{index}] address.shape_id must be a positive integer")
            for field in ("paragraph", "run"):
                if field in address and not self._is_int(address[field]):
                    errors.append(f"edits[{index}] address.{field} must be an integer")
        if errors:
            raise GenerationError(json.dumps({"valid": False, "errors": errors, "warnings": []}, ensure_ascii=False))

    def _resolve_source_pptx(self, source_pptx_path: str | None) -> Path:
        if not source_pptx_path:
            raise GenerationError("source_pptx_path required for template_preserving_edit")
        relative = Path(source_pptx_path)
        if relative.is_absolute():
            raise GenerationError("source_pptx_path must be relative to work_root")
        source = (self.settings.work_root / relative).resolve()
        work_root = self.settings.work_root.resolve()
        if work_root not in source.parents:
            raise GenerationError("source_pptx_path escapes work_root")
        if source.suffix.lower() != ".pptx":
            raise GenerationError("source_pptx_path must point to a .pptx file")
        if not source.exists():
            raise GenerationError(f"source_pptx_path not found: {source_pptx_path}")
        return source

    def _is_positive_int(self, value: object) -> bool:
        return isinstance(value, int) and not isinstance(value, bool) and value > 0

    def _is_int(self, value: object) -> bool:
        return isinstance(value, int) and not isinstance(value, bool)

    def _command_prefix(self, executable: Path) -> list[str]:
        if executable.suffix == ".py" or not os.access(executable, os.X_OK):
            return [sys.executable, str(executable)]
        return [str(executable)]

    async def _run_command(
        self,
        command: list[str],
        *,
        context: GenerationContext,
        cwd: Path,
        label: str,
    ) -> None:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        communicate = asyncio.create_task(process.communicate())
        cancel_wait = asyncio.create_task(context.cancel_event.wait())
        done, pending = await asyncio.wait(
            {communicate, cancel_wait},
            timeout=self.settings.task_timeout_seconds,
            return_when=asyncio.FIRST_COMPLETED,
        )
        if cancel_wait in done:
            await self._terminate(process)
            communicate.cancel()
            raise asyncio.CancelledError()
        if communicate not in done:
            context.cancel_event.set()
            await self._terminate(process)
            communicate.cancel()
            raise GenerationError(f"{label} timed out after {self.settings.task_timeout_seconds:g}s")

        cancel_wait.cancel()
        stdout, stderr = communicate.result()
        if process.returncode != 0:
            raise GenerationError(
                f"{label} failed with exit code {process.returncode}\n"
                f"stdout:\n{stdout.decode(errors='replace')}\n"
                f"stderr:\n{stderr.decode(errors='replace')}"
            )
        for task in pending:
            task.cancel()

    async def _terminate(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
