from __future__ import annotations

import json
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

from .services.document_generator import FotoDocumento, criar_documento_fotos
from .utils.date_utils import obter_data_formatada


APP_TITLE = "Gerador de Registro Fotografico API"
DEFAULT_DOC_TITLE = "ANEXO VI - REGISTRO FOTOGRAFICO"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


app = FastAPI(title=APP_TITLE, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _normalizar_nome_arquivo(nome: str) -> str:
    base = Path(nome).name or "imagem"
    normalizado = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    return normalizado or "imagem"


def _parse_descricoes(raw_descricoes: str, total_fotos: int) -> list[str]:
    descricoes_padrao = [f"Foto {i + 1}" for i in range(total_fotos)]
    if not raw_descricoes.strip():
        return descricoes_padrao

    try:
        data = json.loads(raw_descricoes)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Campo 'descriptions' nao e JSON valido.") from exc

    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="Campo 'descriptions' deve ser uma lista JSON.")

    resultado: list[str] = []
    for i in range(total_fotos):
        valor = data[i] if i < len(data) else ""
        texto = valor.strip() if isinstance(valor, str) else ""
        resultado.append(texto or descricoes_padrao[i])
    return resultado


async def _salvar_upload(upload: UploadFile, destino: Path) -> None:
    with destino.open("wb") as buffer:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            buffer.write(chunk)
    await upload.close()


def _limpar_diretorio(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)


def _resolver_diretorio_frontend() -> Path | None:
    candidatos = [
        PROJECT_ROOT / "frontend_dist",
        PROJECT_ROOT / "frontend" / "dist",
    ]
    for candidato in candidatos:
        if (candidato / "index.html").exists():
            return candidato
    return None


FRONTEND_DIST_DIR = _resolver_diretorio_frontend()
if FRONTEND_DIST_DIR and (FRONTEND_DIST_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="frontend-assets")


def _resolver_arquivo_frontend(full_path: str) -> Path | None:
    if not FRONTEND_DIST_DIR:
        return None

    raiz = FRONTEND_DIST_DIR.resolve()
    candidato = (FRONTEND_DIST_DIR / full_path).resolve()
    try:
        candidato.relative_to(raiz)
    except ValueError:
        return None

    if candidato.is_file():
        return candidato
    return None


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/defaults")
def obter_defaults() -> dict[str, str]:
    return {
        "title": DEFAULT_DOC_TITLE,
        "source": f"Vistoria realizada no dia {obter_data_formatada()}",
    }


@app.post("/api/generate")
async def gerar_documento(
    title: Annotated[str, Form(...)],
    source: Annotated[str, Form(...)],
    files: Annotated[list[UploadFile], File(...)],
    descriptions: Annotated[str, Form()] = "",
) -> FileResponse:
    if not files:
        raise HTTPException(status_code=400, detail="Envie ao menos uma foto.")

    request_dir = Path(tempfile.mkdtemp(prefix="gerador_fotos_"))

    try:
        descricoes = _parse_descricoes(descriptions, len(files))
        fotos: list[FotoDocumento] = []

        for idx, upload in enumerate(files):
            if upload.content_type and not upload.content_type.startswith("image/"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Arquivo invalido em files[{idx}]. Apenas imagens sao permitidas.",
                )

            nome = _normalizar_nome_arquivo(upload.filename or f"foto_{idx + 1}.jpg")
            caminho = request_dir / f"{idx + 1:03d}_{nome}"
            await _salvar_upload(upload, caminho)
            fotos.append(FotoDocumento(caminho=caminho, descricao=descricoes[idx]))

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        nome_saida = f"registro_fotografico_{timestamp}.docx"
        arquivo_saida = request_dir / nome_saida

        criar_documento_fotos(
            titulo=title.strip() or DEFAULT_DOC_TITLE,
            origem_fotos=source.strip() or f"Vistoria realizada no dia {obter_data_formatada()}",
            fotos=fotos,
            arquivo_saida=arquivo_saida,
        )

        return FileResponse(
            path=arquivo_saida,
            filename=nome_saida,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            background=BackgroundTask(_limpar_diretorio, request_dir),
        )
    except HTTPException:
        _limpar_diretorio(request_dir)
        raise
    except Exception as exc:
        _limpar_diretorio(request_dir)
        raise HTTPException(status_code=500, detail=f"Falha ao gerar documento: {exc}") from exc


@app.get("/", include_in_schema=False)
def frontend_index() -> FileResponse:
    if FRONTEND_DIST_DIR:
        return FileResponse(FRONTEND_DIST_DIR / "index.html")
    raise HTTPException(status_code=404, detail="Frontend build nao encontrado.")


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_fallback(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado.")
    if not FRONTEND_DIST_DIR:
        raise HTTPException(status_code=404, detail="Frontend build nao encontrado.")

    arquivo = _resolver_arquivo_frontend(full_path)
    if arquivo:
        return FileResponse(arquivo)
    return FileResponse(FRONTEND_DIST_DIR / "index.html")
