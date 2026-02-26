#!/usr/bin/env python3
"""Entrypoint de compatibilidade para o backend FastAPI."""

import os

import uvicorn


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=port, reload=True)
