"""Dummy Flask AI server for core_backend_system integration tests.

- Model is 'preloaded' once at startup.
- Inference endpoints return JSON with ok/result, and also match the Node client contract.

Run:
  python3 app.py

Env:
  AI_HOST=0.0.0.0
  AI_PORT=5000
"""

from flask import Flask

# Allow both:
# - python -m ai_dummy_server.app
# - python app.py
try:
  from .services.model import load_model
  from .routes.infer import infer_bp
except ImportError:  # pragma: no cover
  from services.model import load_model
  from routes.infer import infer_bp


def create_app() -> Flask:
    app = Flask(__name__)

    # Model preload (once)
    app.config["MODEL"] = load_model()

    app.register_blueprint(infer_bp, url_prefix="/v1/infer")

    @app.get("/health")
    def health():
        return {"ok": True, "service": "ai_dummy_server"}

    return app


if __name__ == "__main__":
    import os

    host = os.environ.get("AI_HOST", "0.0.0.0")
    port = int(os.environ.get("AI_PORT", "5000"))

    app = create_app()
    app.run(host=host, port=port, debug=True)
