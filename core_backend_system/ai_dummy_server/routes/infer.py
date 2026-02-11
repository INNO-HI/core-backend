from flask import Blueprint, current_app, request

infer_bp = Blueprint("infer", __name__)

def _wants_text_response() -> bool:
    accept = (request.headers.get("Accept") or "").lower()
    fmt = (request.args.get("format") or "").lower()
    return "text/plain" in accept or fmt in {"text", "plain"}


@infer_bp.post("/visit_summary")
def visit_summary():
    payload = request.get_json(force=True, silent=False) or {}

    # access preloaded model
    _model = current_app.config.get("MODEL")

    items = [
        {"subject": "주거", "abstract": "더미 요약", "detail": "더미 상세"},
        {"subject": "건강", "abstract": "더미 요약", "detail": "더미 상세"},
    ]

    # If caller wants plain text, return a human-readable string.
    # (Useful for curl testing without JSON/hex confusion.)
    if _wants_text_response():
        transcript = str(payload.get("transcript", "")).strip()
        summary_lines = [
            f"transcript={transcript}",
            "summary:",
        ]
        for it in items:
            summary_lines.append(f"- {it['subject']}: {it['abstract']}")
        return "\n".join(summary_lines), 200, {"Content-Type": "text/plain; charset=utf-8"}

    # default: JSON (matches Node client contract)
    return {
        "ok": True,
        "result": {
            "echo": payload,
            "model": _model,
        },
        "items": items,
    }


@infer_bp.post("/policy_recommendations")
def policy_recommendations():
    payload = request.get_json(force=True, silent=False) or {}

    _model = current_app.config.get("MODEL")

    return {
        "ok": True,
        "result": {
            "echo": payload,
            "model": _model,
        },
        "policies": [
            {
                "age": None,
                "region": None,
                "non_duplicative_policies": [],
                "policy_name": "정책 예시 1",
                "short_description": "더미 정책 설명",
                "detailed_conditions": ["조건1", "조건2"],
                "link": None,
            }
        ],
    }
