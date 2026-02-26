---
title: Gerador de Registro Fotografico
sdk: docker
app_port: 7860
colorFrom: blue
colorTo: green
---

# Gerador de Registro Fotografico (FastAPI + React)

Projeto migrado para arquitetura completa com:

- Backend `FastAPI` para gerar o documento `.docx`
- Frontend `React + Vite` com wizard em etapas
- Ordenacao por arrastar e soltar com descricao inline no mesmo card
- Deploy unificado via `Docker` (pronto para Hugging Face Spaces)

## Funcionalidades

- Fluxo em 2 etapas:
  - Informacoes do documento
  - Upload + ordenacao + descricoes + geracao no mesmo painel
- No painel de fotos:
  - modo descricao: fotos em pares com campo de descricao retratil
  - modo reordenar: grade compacta arrastavel acionada por botao no topo
  - no modo reordenar, clique na miniatura para abrir preview ampliado em modal
- Upload multiplo com deduplicacao basica
- Remocao individual de fotos
- Fallback automatico de descricao (`Foto N`)
- Geracao `.docx` com:
  - correcao de orientacao EXIF
  - dimensionamento proporcional
  - regra especial para fotos verticais

## Estrutura

```text
.
+-- Dockerfile
+-- docker-compose.yml
+-- app.py
+-- backend
|   +-- requirements.txt
|   +-- app
|       +-- main.py
|       +-- services/document_generator.py
|       +-- utils/date_utils.py
+-- frontend
    +-- package.json
    +-- vite.config.js
    +-- src
        +-- App.jsx
        +-- main.jsx
        +-- styles.css
+-- scripts
    +-- setup_local.sh
    +-- run_local_dev.sh
    +-- run_local_prod.sh
```

## Rodar localmente (recomendado)

### 1) Preparar dependencias (uma vez)

```bash
./scripts/setup_local.sh
```

### 2) Modo desenvolvimento (2 servidores)

```bash
./scripts/run_local_dev.sh
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`

### 3) Modo producao local (igual ao Space, 1 servidor)

```bash
./scripts/run_local_prod.sh
```

- App completa: `http://localhost:7860`
- Se quiser outra porta: `PORT=8001 ./scripts/run_local_prod.sh`

## Rodar com Docker (igual ao Hugging Face)

```bash
docker compose up --build
```

App completa em:

- `http://localhost:7860`

## Deploy no Hugging Face Spaces (Docker)

1. Crie um novo Space no Hugging Face com SDK `Docker`.
2. Suba este projeto para o repositorio do Space (incluindo este `README.md` com o front matter acima).
3. O build sera feito automaticamente pelo `Dockerfile`.
4. O app sobe na porta `7860` (definida em `app_port` no front matter).

Opcao A: publicar direto desta pasta (quando ainda nao existe `.git`):

```bash
git init
git branch -M main
git remote add origin https://huggingface.co/spaces/<usuario>/<nome-do-space>
git lfs install
git add .
git commit -m "Deploy FastAPI + React"
git push -u origin main
```

Opcao B: sincronizar para um clone do Space:

```bash
git lfs install
git clone https://huggingface.co/spaces/<usuario>/<nome-do-space>
rsync -av \
  --exclude ".git" \
  --exclude ".venv" \
  --exclude "frontend/node_modules" \
  --exclude "frontend/dist" \
  --exclude "__pycache__" \
  --exclude ".DS_Store" \
  ./ /caminho/do/clone/
cd /caminho/do/clone
git add .
git commit -m "Deploy FastAPI + React"
git push
```

## API

- `GET /api/health`
- `GET /api/defaults`
- `POST /api/generate` (`multipart/form-data`)
  - `title` (string)
  - `source` (string)
  - `descriptions` (JSON string com lista)
  - `files` (lista de imagens na ordem final)
