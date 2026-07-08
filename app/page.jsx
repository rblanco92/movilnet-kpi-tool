"use client";

import { useState, useRef, useCallback } from "react";
import { processLTE, processUMTS } from "@/lib/process";

function MovilnetMark() {
  return (
    <svg viewBox="0 0 100 100" className="mark" aria-label="Movilnet">
      <rect width="100" height="100" rx="22" fill="#21262f" stroke="#2c323c" />
      <path
        d="M18 74 L18 40 C18 34 26 32 30 38 L44 60 C47 65 53 65 56 60 L70 38 C74 32 82 34 82 40 L82 74 L70 74 L70 50 L60 66 C55 74 45 74 40 66 L30 50 L30 74 Z"
        fill="#e8434e"
      />
    </svg>
  );
}

const IconUmts = (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20v-5M9 20V9M15 20v-8M20 20V6" />
  </svg>
);

const IconLte = (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20v-4M5 20v-1M19 20v-7M8.5 12a5 5 0 0 1 7 0M5.5 9a9 9 0 0 1 13 0" />
  </svg>
);

const IconUpload = (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
  </svg>
);

function FileDrop({ label, sublabel, multiple, files, onFiles, roles }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const handle = useCallback(
    (list) => {
      const arr = Array.from(list).filter((f) => /\.xlsx?$/i.test(f.name));
      if (arr.length) onFiles(arr);
    },
    [onFiles]
  );

  return (
    <div>
      <div
        className={"drop" + (over ? " over" : "")}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
      >
        {IconUpload}
        <div className="big">{label}</div>
        <div className="small">{sublabel}</div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple={multiple}
          hidden
          onChange={(e) => handle(e.target.files)}
        />
      </div>
      {files.length > 0 && (
        <ul className="files">
          {files.map((f, i) => (
            <li key={i}>
              <span>📄</span>
              <span>{f.name}</span>
              {roles && roles[i] && (
                <span className={"role " + (roles[i].cls || "")}>
                  {roles[i].text}
                </span>
              )}
              <button
                className="x"
                onClick={(e) => {
                  e.stopPropagation();
                  onFiles(files.filter((_, j) => j !== i));
                }}
                title="Quitar"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBox({ busy, status }) {
  if (!status) return null;
  return (
    <div className={"status " + (status.type === "err" ? "err" : status.type === "ok" ? "ok" : "")}>
      {busy && <span className="spinner" />}
      {status.msg}
    </div>
  );
}

export default function Page() {
  const [tab, setTab] = useState("umts");

  // LTE
  const [lteFiles, setLteFiles] = useState([]);
  const [lteStart, setLteStart] = useState("2026-06-15");
  const [lteEnd, setLteEnd] = useState("2026-06-23");

  // UMTS
  const [umtsFiles, setUmtsFiles] = useState([]);
  const [aStart, setAStart] = useState("2026-06-15");
  const [aEnd, setAEnd] = useState("2026-06-23");
  const [bStart, setBStart] = useState("2026-07-03");
  const [bEnd, setBEnd] = useState("2026-07-07");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setStatus({ type: "info", msg: "Iniciando…" });
    try {
      const res = await fn((m) => setStatus({ type: "info", msg: m }));
      setStatus({
        type: "ok",
        msg: `✓ Listo. ${res.groups} combinaciones procesadas. Se descargó "${res.filename}".`,
      });
    } catch (err) {
      setStatus({ type: "err", msg: "✕ " + (err?.message || String(err)) });
    } finally {
      setBusy(false);
    }
  };

  const runLTE = () =>
    run((onProgress) => processLTE(lteFiles[0], lteStart, lteEnd, onProgress));

  const runUMTS = () =>
    run((onProgress) =>
      processUMTS(
        umtsFiles,
        { start: aStart, end: aEnd },
        { start: bStart, end: bEnd },
        onProgress
      )
    );

  const umtsRoles = umtsFiles.map((f) => {
    const n = f.name.toLowerCase();
    if (n.includes("parte 1") || n.includes("parte1"))
      return { text: "Parte 1", cls: "ok" };
    if (n.includes("parte 2") || n.includes("parte2"))
      return { text: "Parte 2", cls: "ok" };
    return { text: "se detecta al procesar", cls: "" };
  });

  const go = (t) => {
    setTab(t);
    setStatus(null);
  };

  return (
    <div className="shell">
      {/* ===== SIDEBAR ===== */}
      <aside className="sidebar">
        <div className="sb-brand">
          <MovilnetMark />
          <div>
            <h1>
              movil<span>net</span>
            </h1>
            <span className="tag">KPIs · LTE / UMTS</span>
          </div>
        </div>

        <div className="sb-label">Procesadores</div>
        <nav className="sb-nav">
          <button
            className={"sb-item" + (tab === "umts" ? " active" : "")}
            onClick={() => go("umts")}
          >
            {IconUmts}
            <span className="txt">
              <b>UMTS</b>
              <small>Comparativa Antes / Después</small>
            </span>
          </button>
          <button
            className={"sb-item" + (tab === "lte" ? " active" : "")}
            onClick={() => go("lte")}
          >
            {IconLte}
            <span className="txt">
              <b>LTE</b>
              <small>Promedios por celda</small>
            </span>
          </button>
        </nav>

        <div className="sb-foot">
          <span className="priv">
            <span className="dotp" />
            100% local en tu navegador
          </span>
          <div>Los archivos no se suben a ningún servidor. Procesamiento sin límites de tamaño.</div>
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <main className="main">
        {tab === "umts" && (
          <>
            <div className="page-head">
              <h2>UMTS · Comparativa Antes / Después</h2>
              <p>
                Sube los dos archivos (Parte 1 y Parte 2), elige los rangos de
                fechas y descarga la tabla con los promedios lado a lado. Agrupa
                por <b>cellid + sector</b> combinando 1&amp;4→1, 2&amp;5→2, 3&amp;6→3.
              </p>
            </div>

            <div className="grid">
              <div className="col">
                <div className="card">
                  <h3>
                    <span className="num">1</span>Archivos UMTS
                  </h3>
                  <p className="hint">
                    Sube los dos Excel. Se detecta solo cuál es Parte 1 (tráfico)
                    y cuál Parte 2 (accesibilidad); el orden no importa.
                  </p>
                  <FileDrop
                    label="Arrastra los 2 archivos o haz clic para elegir"
                    sublabel="Formato .xlsx · puedes seleccionar ambos a la vez"
                    multiple={true}
                    files={umtsFiles}
                    onFiles={(f) => setUmtsFiles(f.slice(-2))}
                    roles={umtsRoles}
                  />
                </div>

                <div className="card">
                  <h3>
                    <span className="num">2</span>Rangos de fechas
                  </h3>
                  <p className="hint">
                    "Antes" y "Después" se colocan lado a lado en la tabla final.
                  </p>
                  <div className="ranges">
                    <div className="range-box">
                      <div className="label">
                        <span className="dot antes" />
                        Antes
                      </div>
                      <div className="field">
                        <label>Desde</label>
                        <input type="date" value={aStart} onChange={(e) => setAStart(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Hasta</label>
                        <input type="date" value={aEnd} onChange={(e) => setAEnd(e.target.value)} />
                      </div>
                    </div>
                    <div className="range-box">
                      <div className="label">
                        <span className="dot despues" />
                        Después
                      </div>
                      <div className="field">
                        <label>Desde</label>
                        <input type="date" value={bStart} onChange={(e) => setBStart(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Hasta</label>
                        <input type="date" value={bEnd} onChange={(e) => setBEnd(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col">
                <div className="card run-card">
                  <h3>
                    <span className="num">3</span>Generar
                  </h3>
                  <p className="hint">
                    Se descargará un Excel con la comparativa completa.
                  </p>
                  <button
                    className="btn"
                    disabled={busy || umtsFiles.length < 2}
                    onClick={runUMTS}
                  >
                    {busy ? "Procesando…" : "Generar Excel comparativo"}
                  </button>
                  <StatusBox busy={busy} status={status} />
                </div>

                <div className="card">
                  <h3>10 métricas promediadas</h3>
                  <div className="chips">
                    {[
                      "Disponibilidad UMTS",
                      "CS_TRAFFIC (Erl)",
                      "TraficoPS (MB)",
                      "U_HSDPA.UE.Mean",
                      "CS_ServiceDropRatio",
                      "PS_CallDropRatio_OptRF",
                      "Retención Datos",
                      "Retención Voz",
                      "Accesibilidad Voz",
                      "Accesibilidad Datos",
                    ].map((m) => (
                      <span className="chip" key={m}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "lte" && (
          <>
            <div className="page-head">
              <h2>LTE · Promedios por celda</h2>
              <p>
                Sube un archivo LTE, elige el rango de fechas y descarga la tabla
                de promedios. Extrae <b>eNodeB Function Name</b> y{" "}
                <b>Local Cell ID</b> de la columna "Cell".
              </p>
            </div>

            <div className="grid">
              <div className="col">
                <div className="card">
                  <h3>
                    <span className="num">1</span>Archivo LTE
                  </h3>
                  <p className="hint">
                    Sube el Excel de LTE (con las columnas "Start Time" y "Cell").
                  </p>
                  <FileDrop
                    label="Arrastra el archivo o haz clic para elegir"
                    sublabel="Formato .xlsx"
                    multiple={false}
                    files={lteFiles}
                    onFiles={(f) => setLteFiles(f.slice(-1))}
                  />
                </div>

                <div className="card">
                  <h3>
                    <span className="num">2</span>Rango de fechas
                  </h3>
                  <p className="hint">Se filtra la columna "Start Time" (inclusivo).</p>
                  <div className="ranges single">
                    <div className="range-box">
                      <div className="field">
                        <label>Desde</label>
                        <input type="date" value={lteStart} onChange={(e) => setLteStart(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Hasta</label>
                        <input type="date" value={lteEnd} onChange={(e) => setLteEnd(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col">
                <div className="card run-card">
                  <h3>
                    <span className="num">3</span>Generar
                  </h3>
                  <p className="hint">
                    Se descargará un Excel con los promedios por celda.
                  </p>
                  <button
                    className="btn"
                    disabled={busy || lteFiles.length === 0}
                    onClick={runLTE}
                  >
                    {busy ? "Procesando…" : "Generar Excel LTE"}
                  </button>
                  <StatusBox busy={busy} status={status} />
                </div>

                <div className="card">
                  <h3>6 métricas promediadas</h3>
                  <div className="chips">
                    {[
                      "Disponibilidad",
                      "N.º promedio de usuarios",
                      "Volumen tráfico DL",
                      "Accesibilidad RF",
                      "Retención",
                      "ResourceBlockUtilizingRate_DL",
                    ].map((m) => (
                      <span className="chip" key={m}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
