"""Vercel entrypoint: exposes the FastAPI app (API + /workbench/ frontend)."""
from backend.api.main import app  # noqa: F401
