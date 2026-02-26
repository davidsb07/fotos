import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const TITULO_PADRAO = "ANEXO VI - REGISTRO FOTOGRAFICO";
const ETAPAS = ["Informacoes", "Fotos, Ordem e Descricoes"];

function criarOrigemPadrao() {
  const meses = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro"
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
  if (!contentDisposition) {
    return null;
  }

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

function SortableReorderTile({ foto, indice, onRemover, onAbrirPreview }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: foto.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article ref={setNodeRef} style={style} className={`reorder-tile ${isDragging ? "dragging" : ""}`}>
      <button type="button" className="reorder-handle" aria-label="Arrastar foto" {...attributes} {...listeners}>
        Arrastar
      </button>
      <button type="button" className="reorder-preview-btn" onClick={() => onAbrirPreview(foto.id)}>
        <img src={foto.previewUrl} alt={foto.file.name} loading="lazy" className="reorder-thumb" />
      </button>
      <div className="reorder-footer">
        <span className="reorder-index">#{indice + 1}</span>
        <button type="button" className="btn danger small" onClick={() => onRemover(foto.id)}>
          Remover
        </button>
      </div>
    </article>
  );
}

function DescriptionPhotoCard({ foto, indice, onRemover, onAtualizarDescricao, onAbrirPreview }) {
  return (
    <article className="description-photo-card">
      <button type="button" className="description-preview-btn" onClick={() => onAbrirPreview(foto.id)}>
        <img src={foto.previewUrl} alt={foto.file.name} loading="lazy" />
      </button>
      <div className="description-meta">
        <div className="description-meta-header">
          <h3>
            Foto {indice + 1}
          </h3>
          <button type="button" className="btn danger small" onClick={() => onRemover(foto.id)}>
            Remover
          </button>
        </div>
        <p>{foto.file.name}</p>
        <details className="description-details">
          <summary>{foto.description.trim() ? "Editar descricao" : "Adicionar descricao"}</summary>
          <textarea
            value={foto.description}
            onChange={(e) => onAtualizarDescricao(foto.id, e.target.value)}
            rows={4}
            placeholder="Descreva a foto..."
          />
        </details>
      </div>
    </article>
  );
}

export default function App() {
  const [step, setStep] = useState(1);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [photoToRemoveId, setPhotoToRemoveId] = useState(null);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const [defaults, setDefaults] = useState({
    title: TITULO_PADRAO,
    source: criarOrigemPadrao()
  });
  const [title, setTitle] = useState(TITULO_PADRAO);
  const [source, setSource] = useState(criarOrigemPadrao());
  const [photos, setPhotos] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);

  const photosRef = useRef([]);
  const downloadInfoRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    let ativo = true;
    async function carregarDefaults() {
      try {
        const resposta = await fetch(`${API_BASE_URL}/api/defaults`);
        if (!resposta.ok) {
          return;
        }
        const data = await resposta.json();
        if (!ativo) {
          return;
        }
        const novoTitulo = typeof data?.title === "string" && data.title.trim() ? data.title : TITULO_PADRAO;
        const novaOrigem = typeof data?.source === "string" && data.source.trim() ? data.source : criarOrigemPadrao();
        setDefaults({ title: novoTitulo, source: novaOrigem });
        setTitle(novoTitulo);
        setSource(novaOrigem);
      } catch {
        // Sem fallback remoto: manter valores locais.
      }
    }
    carregarDefaults();
    return () => {
      ativo = false;
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
    if (previewIndex === null) {
      return;
    }
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

  const previewPhoto = useMemo(
    () => (previewIndex === null ? null : photos[previewIndex] || null),
    [photos, previewIndex]
  );

  const photoToRemove = useMemo(
    () => photos.find((foto) => foto.id === photoToRemoveId) || null,
    [photos, photoToRemoveId]
  );

  function abrirPreviewPorId(photoId) {
    const idx = photos.findIndex((foto) => foto.id === photoId);
    if (idx >= 0) {
      setPreviewIndex(idx);
    }
  }

  function abrirFotoAnterior() {
    if (!photos.length || previewIndex === null) {
      return;
    }
    setPreviewIndex((previewIndex - 1 + photos.length) % photos.length);
  }

  function abrirProximaFoto() {
    if (!photos.length || previewIndex === null) {
      return;
    }
    setPreviewIndex((previewIndex + 1) % photos.length);
  }

  useEffect(() => {
    if (!previewPhoto && !photoToRemove && !isRestartConfirmOpen) {
      return;
    }

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

      if (!previewPhoto || photoToRemove || isRestartConfirmOpen) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        abrirFotoAnterior();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        abrirProximaFoto();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRestartConfirmOpen, photoToRemove, previewPhoto]);

  const resumoUpload = useMemo(() => {
    if (!photos.length) {
      return "Nenhuma foto adicionada.";
    }
    return `${photos.length} foto(s) pronta(s).`;
  }, [photos]);

  function limparDownload() {
    setDownloadInfo((prev) => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  }

  function adicionarArquivos(fileList) {
    const arquivos = Array.from(fileList || []);
    if (!arquivos.length) {
      return;
    }

    let houveArquivoInvalido = false;

    setPhotos((prev) => {
      const existentes = new Set(prev.map((foto) => foto.fileKey));
      const proximas = [...prev];

      for (const file of arquivos) {
        if (!file.type.startsWith("image/")) {
          houveArquivoInvalido = true;
          continue;
        }

        const fileKey = assinaturaArquivo(file);
        if (existentes.has(fileKey)) {
          continue;
        }

        proximas.push({
          id: gerarId(),
          fileKey,
          file,
          previewUrl: URL.createObjectURL(file),
          description: ""
        });
        existentes.add(fileKey);
      }
      return proximas;
    });

    if (houveArquivoInvalido) {
      setError("Alguns arquivos foram ignorados porque nao sao imagens.");
    } else {
      setError("");
    }
    setStatus("");
    limparDownload();
  }

  function removerFoto(id) {
    if (!photos.some((foto) => foto.id === id)) {
      return;
    }
    setPhotoToRemoveId(id);
  }

  function confirmarRemocaoFoto() {
    if (!photoToRemoveId) {
      return;
    }
    const alvoId = photoToRemoveId;
    const indiceRemovido = photos.findIndex((foto) => foto.id === alvoId);
    const totalAntes = photos.length;
    setPhotoToRemoveId(null);

    setPhotos((prev) => {
      const alvo = prev.find((foto) => foto.id === alvoId);
      if (alvo) {
        URL.revokeObjectURL(alvo.previewUrl);
      }
      return prev.filter((foto) => foto.id !== alvoId);
    });

    if (previewIndex !== null && indiceRemovido >= 0) {
      if (totalAntes <= 1) {
        setPreviewIndex(null);
      } else if (indiceRemovido < previewIndex) {
        setPreviewIndex(previewIndex - 1);
      } else if (indiceRemovido === previewIndex) {
        const proximoIndice = previewIndex >= totalAntes - 1 ? totalAntes - 2 : previewIndex;
        setPreviewIndex(proximoIndice);
      }
    }
    setStatus("");
    limparDownload();
  }

  function limparFotos() {
    setPhotos((prev) => {
      for (const foto of prev) {
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
    if (!over || active.id === over.id) {
      return;
    }

    setPhotos((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) {
        return prev;
      }
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function atualizarDescricao(id, valor) {
    setPhotos((prev) => prev.map((foto) => (foto.id === id ? { ...foto, description: valor } : foto)));
  }

  function irParaUpload() {
    setError("");
    setIsReorderMode(false);
    setStep(2);
  }

  function recomecarFluxo() {
    limparFotos();
    setTitle(defaults.title);
    setSource(defaults.source);
    setStatus("");
    setError("");
    setIsReorderMode(false);
    setPreviewIndex(null);
    setPhotoToRemoveId(null);
    setIsRestartConfirmOpen(false);
    setStep(1);
  }

  function abrirConfirmacaoRecomeco() {
    setPreviewIndex(null);
    setPhotoToRemoveId(null);
    setIsRestartConfirmOpen(true);
  }

  function confirmarRecomeco() {
    recomecarFluxo();
  }

  async function gerarDocumento() {
    if (!photos.length) {
      setError("Envie ao menos uma foto para gerar o documento.");
      return;
    }

    setIsGenerating(true);
    setStatus("");
    setError("");
    limparDownload();

    const formData = new FormData();
    formData.append("title", title.trim() || defaults.title);
    formData.append("source", source.trim() || defaults.source);
    formData.append(
      "descriptions",
      JSON.stringify(
        photos.map((foto, idx) => {
          const texto = foto.description.trim();
          return texto || `Foto ${idx + 1}`;
        })
      )
    );
    for (const foto of photos) {
      formData.append("files", foto.file, foto.file.name);
    }

    try {
      const resposta = await fetch(`${API_BASE_URL}/api/generate`, {
        method: "POST",
        body: formData
      });

      if (!resposta.ok) {
        let erroApi = "Erro ao gerar documento.";
        try {
          const body = await resposta.json();
          if (body?.detail) {
            erroApi = body.detail;
          }
        } catch {
          // resposta sem corpo JSON
        }
        throw new Error(erroApi);
      }

      const nomeArquivo =
        extrairNomeArquivo(resposta.headers.get("content-disposition")) ||
        `registro_fotografico_${Date.now()}.docx`;
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      setDownloadInfo({ url, name: nomeArquivo });
      setStatus(`Documento criado com ${photos.length} foto(s).`);
      baixarArquivo(url, nomeArquivo);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Falha inesperada ao gerar documento.";
      setError(mensagem);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="bg-shape bg-shape-top" />
      <div className="bg-shape bg-shape-bottom" />
      <main className="container">
        <header className="hero">
          <h1>Gerador de Registro Fotográfico</h1>
        </header>

        <ol className="stepper" aria-label="Etapas do processo">
          {ETAPAS.map((label, idx) => {
            const numero = idx + 1;
            const statusClasse = step === numero ? "active" : step > numero ? "done" : "";
            return (
              <li key={label} className={statusClasse}>
                <span>{numero}</span>
                <strong>{label}</strong>
              </li>
            );
          })}
        </ol>

        <section className="card">
          {step === 1 && (
            <div className="stage">
              <h2>Etapa 1: Informacoes do Documento</h2>
              <label>
                Titulo do documento
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                Origem das fotos
                <input value={source} onChange={(e) => setSource(e.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="btn primary" onClick={irParaUpload}>
                  Proximo: Fotos, ordem e descricoes
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="stage">
              <h2>Etapa 2: Fotos, Ordem e Descricoes</h2>
              {photos.length > 0 && (
                <p className="muted">
                  Adicione fotos, arraste para definir a ordem final e escreva as descricoes no mesmo fluxo.
                </p>
              )}
              <label
                className={`dropzone ${isDropzoneActive ? "dropzone-active" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDropzoneActive(true);
                }}
                onDragLeave={() => setIsDropzoneActive(false)}
                onDrop={handleDrop}
              >
                <input type="file" accept="image/*" multiple onChange={handleFileInput} />
                <strong>Arraste fotos para ca ou clique para selecionar</strong>
                <span>Imagens serao adicionadas sem duplicar arquivos iguais.</span>
              </label>

              {photos.length > 0 ? (
                <>
                  <p className="muted">{resumoUpload}</p>

                  <div className="panel-top-actions">
                    <button
                      type="button"
                      className={`btn ${isReorderMode ? "primary" : "ghost"}`}
                      onClick={() => setIsReorderMode((prev) => !prev)}
                      disabled={photos.length < 2}
                    >
                      {isReorderMode ? "Concluir reordenacao" : "Reordenar fotos"}
                    </button>
                    <p className="muted panel-hint">
                      {isReorderMode
                        ? "Modo reordenar ativo: miniaturas menores em grade arrastavel."
                        : "Modo descricao: fotos em pares com campo retratil de descricao."}
                    </p>
                  </div>

                  {isReorderMode ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={photos.map((foto) => foto.id)} strategy={rectSortingStrategy}>
                        <div className="reorder-grid">
                          {photos.map((foto, idx) => (
                            <SortableReorderTile
                              key={foto.id}
                              foto={foto}
                              indice={idx}
                              onRemover={removerFoto}
                              onAbrirPreview={abrirPreviewPorId}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="description-grid">
                      {photos.map((foto, idx) => (
                      <DescriptionPhotoCard
                        key={foto.id}
                        foto={foto}
                        indice={idx}
                        onRemover={removerFoto}
                        onAtualizarDescricao={atualizarDescricao}
                        onAbrirPreview={abrirPreviewPorId}
                      />
                    ))}
                  </div>
                  )}

                  <p className="muted">Se uma descricao ficar vazia, o sistema usa automaticamente Foto N.</p>

                  {status && <p className="status-ok">{status}</p>}
                  {downloadInfo && (
                    <div className="download-box">
                      <p>Documento pronto: {downloadInfo.name}</p>
                      <button type="button" className="btn primary" onClick={() => baixarArquivo(downloadInfo.url, downloadInfo.name)}>
                        Baixar novamente
                      </button>
                    </div>
                  )}

                  <div className="final-actions-grid">
                    <button type="button" className="btn back" onClick={() => setStep(1)}>
                      Voltar
                    </button>
                    <button type="button" className="btn warning" onClick={limparFotos} disabled={!photos.length}>
                      Limpar fotos
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={gerarDocumento}
                      disabled={isGenerating || !photos.length}
                    >
                      {isGenerating ? "Gerando..." : "Gerar documento Word"}
                    </button>
                    <button type="button" className="btn danger" onClick={abrirConfirmacaoRecomeco}>
                      Recomecar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="actions">
                    <button type="button" className="btn back" onClick={() => setStep(1)}>
                      Voltar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="status-error">{error}</p>}
        </section>

        {previewPhoto && (
          <div className="photo-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPreviewIndex(null)}>
            <div className="photo-modal" onClick={(e) => e.stopPropagation()}>
              <div className="photo-modal-top">
                <div className="photo-modal-nav">
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={abrirFotoAnterior}
                    disabled={photos.length < 2}
                    aria-label="Foto anterior"
                  >
                    Anterior
                  </button>
                  <p>{`Foto ${(previewIndex ?? 0) + 1} de ${photos.length}`}</p>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={abrirProximaFoto}
                    disabled={photos.length < 2}
                    aria-label="Proxima foto"
                  >
                    Proxima
                  </button>
                </div>
                <div className="photo-modal-actions">
                  <button type="button" className="btn danger small" onClick={() => removerFoto(previewPhoto.id)}>
                    Remover
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setPreviewIndex(null)}>
                    Fechar
                  </button>
                </div>
              </div>
              <div className="photo-modal-image-wrap">
                <img src={previewPhoto.previewUrl} alt={previewPhoto.file.name} />
              </div>
              <p className="photo-modal-caption">{previewPhoto.file.name}</p>
            </div>
          </div>
        )}

        {photoToRemove && (
          <div className="confirm-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPhotoToRemoveId(null)}>
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-modal-preview-wrap">
                <img className="confirm-modal-preview" src={photoToRemove.previewUrl} alt={photoToRemove.file.name} />
              </div>
              <h3>Remover foto?</h3>
              <p>
                A foto <strong>{photoToRemove.file.name}</strong> sera removida da lista e nao ira para o documento.
              </p>
              <div className="confirm-modal-actions">
                <button type="button" className="btn ghost" onClick={() => setPhotoToRemoveId(null)}>
                  Cancelar
                </button>
                <button type="button" className="btn danger" onClick={confirmarRemocaoFoto}>
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}

        {isRestartConfirmOpen && (
          <div className="confirm-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsRestartConfirmOpen(false)}>
            <div className="confirm-modal warning" onClick={(e) => e.stopPropagation()}>
              <h3>Recomecar processo?</h3>
              <p>Todo o progresso atual sera perdido: fotos, ordem e descricoes.</p>
              <div className="confirm-modal-actions">
                <button type="button" className="btn ghost" onClick={() => setIsRestartConfirmOpen(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn danger" onClick={confirmarRecomeco}>
                  Recomecar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
