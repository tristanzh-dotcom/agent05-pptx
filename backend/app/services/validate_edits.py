from __future__ import annotations

from typing import Any


PLACEHOLDER_PATTERNS = [
    "Question 1",
    "Question 2",
    "Question 3",
    "Vivamus",
    "Lorem ipsum",
    "dolor sit amet",
    "Key Words Here",
    "项目名称",
    "请输入标题",
    "请输入内容",
    "请在此输入",
    "点击此处",
    "Your Title Here",
    "Add Your Text",
    "项目概述",
    "此处添加",
    "请替换",
]


def validate_edits(edits_json: dict, page_count: int | None) -> dict:
    """
    Returns:
        {"valid": True, "warnings": [...]}
        {"valid": False, "errors": [...], "warnings": [...]}
    """
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(edits_json, dict):
        return {"valid": False, "errors": ["edits_json must be an object"], "warnings": warnings}

    selected_slides = edits_json.get("selected_slides")
    if not isinstance(selected_slides, list):
        errors.append("selected_slides must be an array")
    elif not selected_slides:
        errors.append("selected_slides empty")
    else:
        for index, slide in enumerate(selected_slides):
            if not _is_positive_int(slide):
                errors.append(f"selected_slides[{index}] must be a positive integer")
        if page_count is not None:
            selected_count = len(selected_slides)
            if selected_count == page_count + 1:
                warnings.append(f"selected_slides length {selected_count} exceeds requested page_count {page_count} by 1")
            elif selected_count > page_count + 1:
                errors.append(f"selected_slides length {selected_count} exceeds requested page_count {page_count}")

    edits = edits_json.get("edits")
    if not isinstance(edits, list):
        errors.append("edits must be an array")
    else:
        seen_slots: set[tuple[int, str]] = set()
        seen_addresses: set[tuple[int, int, int, int]] = set()
        for index, edit in enumerate(edits):
            if not isinstance(edit, dict):
                errors.append(f"edits[{index}] must be an object")
                continue
            _validate_edit_schema(index, edit, errors)
            slide = edit.get("slide")
            slot_id = edit.get("slot_id")
            address = edit.get("address")
            new_text = edit.get("new_text")
            if isinstance(slide, int) and not isinstance(slide, bool) and isinstance(slot_id, str):
                key = (slide, slot_id)
                if key in seen_slots:
                    errors.append(f"duplicate edit for slide {slide} slot {slot_id}")
                else:
                    seen_slots.add(key)
            if isinstance(slide, int) and not isinstance(slide, bool) and isinstance(address, dict):
                shape_id = address.get("shape_id")
                paragraph = address.get("paragraph", 0)
                run = address.get("run", 0)
                if _is_positive_int(shape_id) and _is_non_bool_int(paragraph) and _is_non_bool_int(run):
                    address_key = (slide, shape_id, paragraph, run)
                    if address_key in seen_addresses:
                        errors.append(f"duplicate edit for slide {slide} address shape_id {shape_id} paragraph {paragraph} run {run}")
                    else:
                        seen_addresses.add(address_key)
            if isinstance(new_text, str):
                matched = _matched_placeholder(new_text)
                if matched:
                    errors.append(f"slide {slide} slot {slot_id} new_text matches placeholder pattern: {matched}")

    if errors:
        return {"valid": False, "errors": errors, "warnings": warnings}
    return {"valid": True, "warnings": warnings}


def _validate_edit_schema(index: int, edit: dict[str, Any], errors: list[str]) -> None:
    required_fields = ("slide", "new_text")
    for field in required_fields:
        if field not in edit:
            errors.append(f"edits[{index}] missing required field: {field}")
    if "slot_id" not in edit and "address" not in edit:
        errors.append(f"edits[{index}] missing required field: slot_id")

    if "slide" in edit and not isinstance(edit["slide"], int):
        errors.append(f"edits[{index}] slide must be an integer")
    elif isinstance(edit.get("slide"), bool):
        errors.append(f"edits[{index}] slide must be an integer")

    if "slot_id" in edit and not isinstance(edit["slot_id"], str):
        errors.append(f"edits[{index}] slot_id must be a string")

    if "address" in edit:
        _validate_address(index, edit["address"], errors)

    if "new_text" in edit and not isinstance(edit["new_text"], str):
        errors.append(f"edits[{index}] new_text must be a string")


def _validate_address(index: int, address: object, errors: list[str]) -> None:
    if not isinstance(address, dict):
        errors.append(f"edits[{index}] address must be an object")
        return
    if not _is_positive_int(address.get("shape_id")):
        errors.append(f"edits[{index}] address.shape_id must be a positive integer")
    for field in ("paragraph", "run"):
        if field in address and not isinstance(address[field], int):
            errors.append(f"edits[{index}] address.{field} must be an integer")
        elif isinstance(address.get(field), bool):
            errors.append(f"edits[{index}] address.{field} must be an integer")


def _is_positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _is_non_bool_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _matched_placeholder(text: str) -> str | None:
    lower_text = text.lower()
    for pattern in PLACEHOLDER_PATTERNS:
        if _contains_placeholder(lower_text, text, pattern):
            return pattern
    return None


def _contains_placeholder(lower_text: str, original_text: str, pattern: str) -> bool:
    if pattern.isascii():
        return pattern.lower() in lower_text
    return pattern in original_text
