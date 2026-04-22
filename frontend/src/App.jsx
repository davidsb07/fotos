import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const TITULO_PADRAO = "ANEXO VI - REGISTRO FOTOGRÁFICO";
const ETAPAS = [
  { id: 1, short: "Dados", title: "Informações do documento" },
  { id: 2, short: "Fotos", title: "Fotos, ordem e descrições" },
];
const TEMPO_MINIMO_LOADER_MS = 900;

function criarOrigemPadrao() {
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = meses[hoje.getMonth()];
  const ano = hoje.getFullYear();
  return `Vistoria realizada no dia ${dia} de ${mes} de ${ano}`;
}

function gerarId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function assinaturaArquivo(file) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

function extrairNomeArquivo(contentDisposition) {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const simpleMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return simpleMatch?.[1] || null;
}

function baixarArquivo(url, nomeArquivo) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = nomeArquivo;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function formatarTempoGeracao(totalSegundos) {
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

function aguardarProximoFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function criarDescricaoFallback(indice) {
  return `Foto ${indice + 1}`;
}

function SortablePhotoTile({ foto, indice, onAbrirPreview, onRemover }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: foto.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`reorder-tile ${isDragging ? "dragging" : ""}`}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Arrastar ${foto.file.name}`}
        {...attributes}
        {...listeners}
      >
        Arrastar
      </button>
      <button
        type="button"
        className="reorder-preview-btn"
        onClick={() => onAbrirPreview(foto.id)}
      >
        <img src={foto.previewUrl} alt={foto.file.name} className="reorder-thumb" loading="lazy" />
      </button>
      <div className="tile-footer">
        <span className="tile-index">#{indice + 1}</span>
        <button type="button" className="secondary small-button danger-button" onClick={() => onRemover(foto.id)}>
          Remover
        </button>
      </div>
    </article>
  );
}

function DescriptionPhotoCard({ foto, indice, onAbrirPreview, onAtualizarDescricao, onRemover }) {
  return (
    <article className="photo-card">
      <button type="button" className="photo-preview-button" onClick={() => onAbrirPreview(foto.id)}>
        <img src={foto.previewUrl} alt={foto.file.name} loading="lazy" />
      </button>
      <div className="photo-card-body">
        <div className="photo-card-head">
          <div>
            <p className="eyebrow small">Foto {indice + 1}</p>
            <h3>{foto.file.name}</h3>
          </div>
        </div>
        <label>
          <span>Descrição</span>
          <textarea
            rows={4}
            value={foto.description}
            onChange={(event) => onAtualizarDescricao(foto.id, event.target.value)}
            placeholder={`Ex.: ${criarDescricaoFallback(indice)}`}
          />
        </label>
        <button type="button" className="secondary small-button danger-button" onClick={() => onRemover(foto.id)}>
          Remover
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const [step, setStep] = useState(1);
  const [defaults, setDefaults] = useState({
    title: TITULO_PADRAO,
    source: criarOrigemPadrao(),
  });
  const [title, setTitle] = useState(TITULO_PADRAO);
  const [source, setSource] = useState(criarOrigemPadrao());
  const [photos, setPhotos] = useState([]);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [photoToRemoveId, setPhotoToRemoveId] = useState(null);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const [dotsPinned, setDotsPinned] = useState(false);

  const photosRef = useRef([]);
  const downloadInfoRef = useRef(null);
  const generationStartedAtRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let active = true;

    async function carregarDefaults() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/defaults`);
        if (!response.ok) return;

        const data = await response.json();
        if (!active) return;

        const nextTitle =
          typeof data?.title === "string" && data.title.trim() ? data.title : TITULO_PADRAO;
        const nextSource =
          typeof data?.source === "string" && data.source.trim()
            ? data.source
            : criarOrigemPadrao();

        setDefaults({ title: nextTitle, source: nextSource });
        setTitle(nextTitle);
        setSource(nextSource);
      } catch {
        // Mantém fallback local.
      }
    }

    carregarDefaults();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    downloadInfoRef.current = downloadInfo;
  }, [downloadInfo]);

  useEffect(() => {
    return () => {
      for (const foto of photosRef.current) {
        URL.revokeObjectURL(foto.previewUrl);
      }
      if (downloadInfoRef.current?.url) {
        URL.revokeObjectURL(downloadInfoRef.current.url);
      }
    };
  }, []);

  useEffect(() => {
    if (isReorderMode && photos.length < 2) {
      setIsReorderMode(false);
    }
  }, [isReorderMode, photos.length]);

  useEffect(() => {
    if (previewIndex === null) return;
    if (!photos.length) {
      setPreviewIndex(null);
      return;
    }
    if (previewIndex >= photos.length) {
      setPreviewIndex(photos.length - 1);
    }
  }, [photos, previewIndex]);

  useEffect(() => {
    if (photoToRemoveId && !photos.some((foto) => foto.id === photoToRemoveId)) {
      setPhotoToRemoveId(null);
    }
  }, [photoToRemoveId, photos]);

  useEffect(() => {
    if (!isGenerating) {
      setGenerationElapsedSeconds(0);
      generationStartedAtRef.current = null;
      return;
    }

    if (!generationStartedAtRef.current) {
      generationStartedAtRef.current = Date.now();
    }

    const intervalId = window.setInterval(() => {
      const startedAt = generationStartedAtRef.current || Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setGenerationElapsedSeconds(elapsedSeconds);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isGenerating]);

  useEffect(() => {
    function updateActiveStepFromScroll() {
      const panels = Array.from(document.querySelectorAll("[data-step-panel]"));
      let activeStep = step;

      for (const panel of panels) {
        const rect = panel.getBoundingClientRect();
        if (rect.top <= 130 && rect.bottom > 130) {
          const nextStep = Number(panel.getAttribute("data-step-panel"));
          if (Number.isFinite(nextStep)) {
            activeStep = nextStep;
          }
          break;
        }
      }

      setStep((current) => (current === activeStep ? current : activeStep));
      setDotsPinned(window.scrollY > 120);
    }

    updateActiveStepFromScroll();
    window.addEventListener("scroll", updateActiveStepFromScroll, { passive: true });
    window.addEventListener("resize", updateActiveStepFromScroll);
    return () => {
      window.removeEventListener("scroll", updateActiveStepFromScroll);
      window.removeEventListener("resize", updateActiveStepFromScroll);
    };
  }, [step]);

  const resumoUpload = useMemo(() => {
    if (!photos.length) return "Nenhuma foto adicionada.";
    return `${photos.length} foto(s) pronta(s) para o documento.`;
  }, [photos]);

  const previewPhoto = useMemo(
    () => (previewIndex === null ? null : photos[previewIndex] || null),
    [photos, previewIndex],
  );

  const photoToRemove = useMemo(
    () => photos.find((foto) => foto.id === photoToRemoveId) || null,
    [photos, photoToRemoveId],
  );

  function abrirPreviewPorId(photoId) {
    const index = photos.findIndex((foto) => foto.id === photoId);
    if (index >= 0) {
      setPreviewIndex(index);
    }
  }

  function abrirFotoAnterior() {
    if (!photos.length || previewIndex === null) return;
    setPreviewIndex((previewIndex - 1 + photos.length) % photos.length);
  }

  function abrirProximaFoto() {
    if (!photos.length || previewIndex === null) return;
    setPreviewIndex((previewIndex + 1) % photos.length);
  }

  useEffect(() => {
    if (!previewPhoto && !photoToRemove && !isRestartConfirmOpen) return;

    function onKeyDown(event) {
      if (event.key === "Escape") {
        if (isRestartConfirmOpen) {
          setIsRestartConfirmOpen(false);
          return;
        }
        if (photoToRemove) {
          setPhotoToRemoveId(null);
          return;
        }
        if (previewPhoto) {
          setPreviewIndex(null);
        }
        return;
      }

      if (!previewPhoto || photoToRemove || isRestartConfirmOpen) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        abrirFotoAnterior();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        abrirProximaFoto();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRestartConfirmOpen, photoToRemove, previewPhoto, photos.length, previewIndex]);

  function irParaEtapa(nextStep) {
    if (nextStep === 2) {
      setError("");
    }
    setStep(nextStep);
    const panel = document.querySelector(`[data-step-panel="${nextStep}"]`);
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function irParaTopo() {
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limparDownload() {
    setDownloadInfo((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }

  function adicionarArquivos(fileList) {
    const incomingFiles = Array.from(fileList || []);
    if (!incomingFiles.length) return;

    let hasInvalidFile = false;

    setPhotos((current) => {
      const existingKeys = new Set(current.map((foto) => foto.fileKey));
      const next = [...current];

      for (const file of incomingFiles) {
        if (!file.type.startsWith("image/")) {
          hasInvalidFile = true;
          continue;
        }

        const fileKey = assinaturaArquivo(file);
        if (existingKeys.has(fileKey)) {
          continue;
        }

        next.push({
          id: gerarId(),
          fileKey,
          file,
          previewUrl: URL.createObjectURL(file),
          description: "",
        });
        existingKeys.add(fileKey);
      }

      return next;
    });

    setStatus("");
    limparDownload();
    setError(hasInvalidFile ? "Alguns arquivos foram ignorados porque não eram imagens." : "");
  }

  function removerFoto(id) {
    if (!photos.some((foto) => foto.id === id)) return;
    setPhotoToRemoveId(id);
  }

  function confirmarRemocaoFoto() {
    if (!photoToRemoveId) return;

    const removedIndex = photos.findIndex((foto) => foto.id === photoToRemoveId);
    const totalBefore = photos.length;
    const targetId = photoToRemoveId;

    setPhotoToRemoveId(null);
    setPhotos((current) => {
      const target = current.find((foto) => foto.id === targetId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((foto) => foto.id !== targetId);
    });

    if (previewIndex !== null && removedIndex >= 0) {
      if (totalBefore <= 1) {
        setPreviewIndex(null);
      } else if (removedIndex < previewIndex) {
        setPreviewIndex(previewIndex - 1);
      } else if (removedIndex === previewIndex) {
        setPreviewIndex(previewIndex >= totalBefore - 1 ? totalBefore - 2 : previewIndex);
      }
    }

    setStatus("");
    limparDownload();
  }

  function limparFotos() {
    setPhotos((current) => {
      for (const foto of current) {
        URL.revokeObjectURL(foto.previewUrl);
      }
      return [];
    });
    setStatus("");
    setError("");
    setIsReorderMode(false);
    setPreviewIndex(null);
    setPhotoToRemoveId(null);
    setIsRestartConfirmOpen(false);
    limparDownload();
  }

  function recomecarFluxo() {
    limparFotos();
    setTitle(defaults.title);
    setSource(defaults.source);
    setStep(1);
  }

  function handleFileInput(event) {
    adicionarArquivos(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDropzoneActive(false);
    adicionarArquivos(event.dataTransfer.files);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPhotos((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id);
      const newIndex = current.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  function atualizarDescricao(id, value) {
    setPhotos((current) =>
      current.map((foto) => (foto.id === id ? { ...foto, description: value } : foto)),
    );
  }

  async function gerarDocumento() {
    if (!photos.length) {
      setError("Envie ao menos uma foto para gerar o documento.");
      return;
    }

    generationStartedAtRef.current = Date.now();
    setGenerationElapsedSeconds(0);
    setIsGenerating(true);
    setStatus("");
    setError("");
    limparDownload();

    await aguardarProximoFrame();

    const formData = new FormData();
    formData.append("title", title.trim() || defaults.title);
    formData.append("source", source.trim() || defaults.source);
    formData.append(
      "descriptions",
      JSON.stringify(
        photos.map((foto, indice) => foto.description.trim() || criarDescricaoFallback(indice)),
      ),
    );

    for (const foto of photos) {
      formData.append("files", foto.file, foto.file.name);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let apiError = "Erro ao gerar documento.";
        try {
          const body = await response.json();
          if (body?.detail) {
            apiError = body.detail;
          }
        } catch {
          // resposta sem JSON
        }
        throw new Error(apiError);
      }

      const fileName =
        extrairNomeArquivo(response.headers.get("content-disposition")) ||
        `registro_fotografico_${Date.now()}.docx`;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setDownloadInfo({ url, name: fileName });
      setStatus(`Documento criado com ${photos.length} foto(s).`);
      baixarArquivo(url, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada ao gerar documento.");
    } finally {
      const startedAt = generationStartedAtRef.current ?? Date.now();
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs < TEMPO_MINIMO_LOADER_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, TEMPO_MINIMO_LOADER_MS - elapsedMs),
        );
      }
      setIsGenerating(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className={`side-dots ${dotsPinned ? "is-pinned" : ""}`} aria-label="Etapas">
        <button
          type="button"
          className="side-dot side-dot-top"
          data-step-label="Início"
          aria-label="Início"
          onClick={irParaTopo}
        >
          Início
        </button>
        {ETAPAS.map((etapa) => (
          <button
            key={etapa.id}
            type="button"
            className={`side-dot ${step === etapa.id ? "active" : ""}`}
            data-step-target={`step-${etapa.id}`}
            data-step-label={etapa.short}
            aria-label={`Etapa ${etapa.id} - ${etapa.title}`}
            onClick={() => irParaEtapa(etapa.id)}
          >
            {etapa.id}
          </button>
        ))}
      </aside>

      <main className="page">
        <section className="hero">
          <div className="hero-brand">
            <img className="hero-logo" src="/assets/RodaModelo-cortado.png" alt="RodaModelo" />
          </div>
          <div className="hero-copy">
            <h1 className="hero-title">Gerador de Relatório Fotográfico</h1>
            <p className="hero-subtitle hero-subtitle-current">
              Anexo fotográfico com fotos, ordem final e descrições
            </p>
            <p className="eyebrow">Registro Fotográfico</p>
            <h1>Gerador de Documento Fotográfico</h1>
            <p className="hero-subtitle">
              Extraído do Space original e reorganizado em um fluxo com etapas, cards e ações no
              padrão visual dos seus apps.
            </p>
          </div>
          <div className="hero-badge">
            <strong>Saída</strong>
            <span>.docx com fotos, ordem final e descrições</span>
          </div>
        </section>

        <section className="status-strip" aria-label="Resumo do processo">
          <div className="status-item">
            <span>Etapa atual</span>
            <strong>{step === 1 ? "Dados" : isReorderMode ? "Reordenar" : "Descrições"}</strong>
          </div>
          <div className="status-item">
            <span>Fotos</span>
            <strong>{photos.length}</strong>
          </div>
          <div className="status-item">
            <span>Documento</span>
            <strong>{downloadInfo ? "Pronto" : isGenerating ? "Gerando" : "Pendente"}</strong>
          </div>
        </section>

        <section
          id="step-1"
          data-step-panel="1"
          className={`panel ${step === 1 ? "is-active-step" : ""}`}
        >
          <div className="section-head">
            <div>
              <p className="eyebrow small">Etapa 1</p>
              <h2>Informações do documento</h2>
            </div>
          </div>

          <div className="panel-body stage-grid">
            <label className="field-card">
              <span>Título do documento</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="field-card field-card-wide">
              <span>Origem das fotos</span>
              <input value={source} onChange={(event) => setSource(event.target.value)} />
            </label>
          </div>
        </section>

        <section
          id="step-2"
          data-step-panel="2"
          className={`panel ${step === 2 ? "is-active-step" : ""}`}
        >
          <div className="section-head">
            <div>
              <p className="eyebrow small">Etapa 2</p>
              <h2>Fotos, ordem e descrições</h2>
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setIsReorderMode((current) => !current)}
                disabled={photos.length < 2}
              >
                {isReorderMode ? "Concluir reordenação" : "Reordenar fotos"}
              </button>
              <button type="button" className="secondary" onClick={() => irParaEtapa(1)}>
                Voltar aos dados
              </button>
            </div>
          </div>

          <div className="panel-body">
            <label
              className={`dropzone ${isDropzoneActive ? "dropzone-active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDropzoneActive(true);
              }}
              onDragLeave={() => setIsDropzoneActive(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept="image/*" multiple onChange={handleFileInput} />
              <strong>Arraste fotos para cá ou clique para selecionar</strong>
              <span>O app evita duplicações básicas e mantém a ordem final definida por você.</span>
            </label>

            {photos.length > 0 && (
            <div className="toolbar-card">
              <div>
              <p className="muted">{resumoUpload}</p>
              <p className="muted">
                {isReorderMode
                  ? "Modo reordenação ativo: arraste os cards e clique na miniatura para ampliar."
                  : "Modo descrição ativo: preencha a legenda de cada foto no próprio card."}
              </p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsReorderMode((current) => !current)}
                disabled={photos.length < 2}
              >
                {isReorderMode ? "Concluir reordenação" : "Reordenar fotos"}
              </button>
            </div>
            )}

            {!photos.length && (
              <div className="empty-block">Envie imagens para começar a montar o documento.</div>
            )}

            {photos.length > 0 && isReorderMode && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={photos.map((foto) => foto.id)} strategy={rectSortingStrategy}>
                  <div className="reorder-grid">
                    {photos.map((foto, indice) => (
                      <SortablePhotoTile
                        key={foto.id}
                        foto={foto}
                        indice={indice}
                        onAbrirPreview={abrirPreviewPorId}
                        onRemover={removerFoto}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {photos.length > 0 && !isReorderMode && (
              <div className="photo-grid">
                {photos.map((foto, indice) => (
                  <DescriptionPhotoCard
                    key={foto.id}
                    foto={foto}
                    indice={indice}
                    onAbrirPreview={abrirPreviewPorId}
                    onAtualizarDescricao={atualizarDescricao}
                    onRemover={removerFoto}
                  />
                ))}
              </div>
            )}

            {photos.length > 0 && (
              <p className="muted helper-line">
                Se uma descrição ficar vazia, o sistema usa automaticamente{" "}
                <code>Foto N</code>.
              </p>
            )}

            {status && <p className="app-notice success">{status}</p>}
            {error && <p className="app-notice error">{error}</p>}

            {downloadInfo && (
              <div className="download-card">
                <div>
                  <p className="eyebrow small">Arquivo pronto</p>
                  <strong>{downloadInfo.name}</strong>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => baixarArquivo(downloadInfo.url, downloadInfo.name)}
                >
                  Baixar novamente
                </button>
              </div>
            )}

            {photos.length > 0 && (
            <div className="table-actions split-actions">
              <button type="button" className="secondary" onClick={limparFotos} disabled={!photos.length}>
                Limpar fotos
              </button>
              <div className="actions">
                <button type="button" className="secondary danger-button" onClick={() => setIsRestartConfirmOpen(true)}>
                  Recomeçar
                </button>
                <button type="button" onClick={gerarDocumento} disabled={isGenerating || !photos.length}>
                  {isGenerating ? "Gerando..." : "Gerar documento Word"}
                </button>
              </div>
            </div>
            )}
          </div>
        </section>
      </main>

      {previewPhoto && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPreviewIndex(null)}>
          <div className="modal-card modal-photo" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow small">Prévia</p>
                <h3>{previewPhoto.file.name}</h3>
              </div>
              <div className="actions">
                <button type="button" className="secondary" onClick={abrirFotoAnterior} disabled={photos.length < 2}>
                  Anterior
                </button>
                <button type="button" className="secondary" onClick={abrirProximaFoto} disabled={photos.length < 2}>
                  Próxima
                </button>
                <button type="button" className="secondary danger-button" onClick={() => removerFoto(previewPhoto.id)}>
                  Remover
                </button>
                <button type="button" className="secondary" onClick={() => setPreviewIndex(null)}>
                  Fechar
                </button>
              </div>
            </div>
            <div className="modal-photo-frame">
              <img src={previewPhoto.previewUrl} alt={previewPhoto.file.name} />
            </div>
            <p className="muted">{`Foto ${(previewIndex ?? 0) + 1} de ${photos.length}`}</p>
          </div>
        </div>
      )}

      {photoToRemove && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPhotoToRemoveId(null)}>
          <div className="modal-card confirm-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow small">Confirmação</p>
                <h3>Remover foto?</h3>
              </div>
            </div>
            <img className="confirm-thumb" src={photoToRemove.previewUrl} alt={photoToRemove.file.name} />
            <p className="muted">
              A foto <strong>{photoToRemove.file.name}</strong> será removida da lista e não irá para o documento.
            </p>
            <div className="table-actions split-actions">
              <button type="button" className="secondary" onClick={() => setPhotoToRemoveId(null)}>
                Cancelar
              </button>
              <button type="button" className="danger-button" onClick={confirmarRemocaoFoto}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {isRestartConfirmOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsRestartConfirmOpen(false)}>
          <div className="modal-card confirm-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow small">Confirmação</p>
                <h3>Recomeçar processo?</h3>
              </div>
            </div>
            <p className="muted">
              Todo o progresso atual será perdido: fotos, ordem, descrições e arquivo gerado.
            </p>
            <div className="table-actions split-actions">
              <button type="button" className="secondary" onClick={() => setIsRestartConfirmOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="danger-button" onClick={recomecarFluxo}>
                Recomeçar
              </button>
            </div>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="processing-overlay" role="status" aria-live="polite" aria-modal="true">
          <div className="processing-card">
            <div className="processing-spinner" aria-hidden="true" />
            <strong>Gerando documento Word...</strong>
            <span>Tempo decorrido: {formatarTempoGeracao(generationElapsedSeconds)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
