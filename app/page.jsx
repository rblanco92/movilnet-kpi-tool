"use client";

import { useState, useRef, useCallback } from "react";
import { processLTE, processUMTS } from "@/lib/process";

function MovilnetMark() {
  // Isotipo "M" de doble pico en rojo Movilnet
  return (
    <svg viewBox="0 0 100 100" className="mark" aria-label="Movilnet">
      <rect width="100" height="100" rx="20" fill="#ffffff" stroke="#e4e8ec" />
      <path
        d="M18 74 L18 40 C18 34 26 32 30 38 L44 60 C47 65 53 65 56 60 L70 38 C74 32 82 34 82 40 L82 74 L70 74 L70 50 L60 66 C55 74 45 74 40 66 L30 50 L30 74 Z"
        fill="#e8434e"
      />
    </svg>
  );
}

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
  const [status, setStatus] = useState(null); // {type, msg}

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

  // roles para archivos UMTS (indicativo)
  const umtsRoles = umtsFiles.map((f) => {
    const n = f.name.toLowerCase();
    if (n.includes("parte 1") || n.includes("parte1"))
      return { text: "Parte 1", cls: "ok" };
    if (n.includes("parte 2") || n.includes("parte2"))
      return { text: "Parte 2", cls: "ok" };
    return { text: "se detecta al procesar", cls: "" };
  });

  return (
    <div className="wrap">
      <div className="brand">
        <MovilnetMark />
        <h1>
          movil<span>net</span> · KPIs
        </h1>
      </div>
      <p className="subtitle">
        Sube los reportes de Excel, elige el rango de fechas y descarga la tabla
        de promedios lista. Todo el procesamiento ocurre <b>en tu navegador</b>:
        los datos no se suben a ningún servidor.
      </p>

      <div className="tabs">
        <button
          className={"tab" + (tab === "umts" ? " active" : "")}
          onClick={() => {
            setTab("umts");
            setStatus(null);
          }}
        >
          UMTS · Comparativa Antes/Despues
          <small>2 archivos · agrupa por cellid + sector (1&amp;4, 2&amp;5, 3&amp;6)</small>
        </button>
        <button
          className={"tab" + (tab === "lte" ? " active" : "")}
          onClick={() => {
            setTab("lte");
            setStatus(null);
          }}
        >
          LTE · Promedios
          <small>1 archivo · agrupa por eNodeB + Local Cell ID</small>
        </button>
      </div>

      {tab === "lte" && (
        <>
          <div className="card">
            <h2>
              <span className="num">1</span>Archivo LTE
            </h2>
            <p className="hint">
              Sube el Excel de LTE (con las columnas “Start Time” y “Cell”).
            </p>
            <FileDrop
              label="Arrastra el archivo aquí o haz clic para elegir"
              sublabel="Formato .xlsx"
              multiple={false}
              files={lteFiles}
              onFiles={(f) => setLteFiles(f.slice(-1))}
            />
          </div>

          <div className="card">
            <h2>
              <span className="num">2</span>Rango de fechas
            </h2>
            <p className="hint">Se filtra la columna “Start Time” (inclusivo).</p>
            <div className="ranges">
              <div className="range-box">
                <div className="field">
                  <label>Desde</label>
                  <input
                    type="date"
                    value={lteStart}
                    onChange={(e) => setLteStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Hasta</label>
                  <input
                    type="date"
                    value={lteEnd}
                    onChange={(e) => setLteEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="range-box">
                <div className="label">Métricas promediadas</div>
                <div className="metrics-note">
                  Disponibilidad · N.º promedio de usuarios · Volumen de tráfico
                  DL · Accesibilidad RF · Retención · ResourceBlockUtilizingRate_DL
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>
              <span className="num">3</span>Generar
            </h2>
            <div className="actions">
              <button
                className="btn"
                disabled={busy || lteFiles.length === 0}
                onClick={runLTE}
              >
                {busy ? "Procesando…" : "Generar Excel LTE"}
              </button>
              {status && (
                <span className={"status " + (status.type === "err" ? "err" : status.type === "ok" ? "ok" : "")}>
                  {busy && <span className="spinner" />}
                  {status.msg}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {tab === "umts" && (
        <>
          <div className="card">
            <h2>
              <span className="num">1</span>Archivos UMTS (Parte 1 y Parte 2)
            </h2>
            <p className="hint">
              Sube los dos Excel. Se detecta automáticamente cuál es Parte 1
              (tráfico) y cuál Parte 2 (accesibilidad); el orden no importa.
            </p>
            <FileDrop
              label="Arrastra los 2 archivos aquí o haz clic para elegir"
              sublabel="Formato .xlsx · puedes seleccionar ambos a la vez"
              multiple={true}
              files={umtsFiles}
              onFiles={(f) => setUmtsFiles(f.slice(-2))}
              roles={umtsRoles}
            />
          </div>

          <div className="card">
            <h2>
              <span className="num">2</span>Rangos de fechas
            </h2>
            <p className="hint">
              “Antes” y “Despues” se colocan lado a lado en la tabla final.
            </p>
            <div className="ranges">
              <div className="range-box">
                <div className="label">
                  <span className="dot antes" />
                  Antes
                </div>
                <div className="field">
                  <label>Desde</label>
                  <input
                    type="date"
                    value={aStart}
                    onChange={(e) => setAStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Hasta</label>
                  <input
                    type="date"
                    value={aEnd}
                    onChange={(e) => setAEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="range-box">
                <div className="label">
                  <span className="dot despues" />
                  Despues
                </div>
                <div className="field">
                  <label>Desde</label>
                  <input
                    type="date"
                    value={bStart}
                    onChange={(e) => setBStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Hasta</label>
                  <input
                    type="date"
                    value={bEnd}
                    onChange={(e) => setBEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="metrics-note" style={{ marginTop: 14 }}>
              <b>10 métricas:</b> Disponibilidad UMTS · CS_TRAFFIC_UMTS (Erl) ·
              TraficoPS (MB) · U_HSDPA.UE.Mean.Cell · CS_ServiceDropRatio ·
              PS_CallDropRatio_OptRF · Retención Datos · Retención Voz ·
              Accesibilidad Voz · Accesibilidad Datos. Sectores 1&amp;4→1,
              2&amp;5→2, 3&amp;6→3.
            </div>
          </div>

          <div className="card">
            <h2>
              <span className="num">3</span>Generar
            </h2>
            <div className="actions">
              <button
                className="btn"
                disabled={busy || umtsFiles.length < 2}
                onClick={runUMTS}
              >
                {busy ? "Procesando…" : "Generar Excel comparativo"}
              </button>
              {status && (
                <span className={"status " + (status.type === "err" ? "err" : status.type === "ok" ? "ok" : "")}>
                  {busy && <span className="spinner" />}
                  {status.msg}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      <div className="footer">
        <span>Movilnet · Procesador de KPIs LTE / UMTS</span>
        <span>Procesamiento 100% local en el navegador</span>
      </div>
    </div>
  );
}
