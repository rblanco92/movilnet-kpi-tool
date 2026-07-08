"use client";

import { useState, useRef, useCallback } from "react";
import { processLTE, processUMTS } from "@/lib/process";

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 100 100" aria-label="Movilnet">
      <rect width="100" height="100" rx="24" fill="#fff" stroke="#e8ebef" />
      <path
        d="M18 74 L18 40 C18 34 26 32 30 38 L44 60 C47 65 53 65 56 60 L70 38 C74 32 82 34 82 40 L82 74 L70 74 L70 50 L60 66 C55 74 45 74 40 66 L30 50 L30 74 Z"
        fill="#e8434e"
      />
    </svg>
  );
}

const IconUp = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
      >
        <div className="up">{IconUp}</div>
        <b>{label}</b>
        <small>{sublabel}</small>
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
                <span className={"role " + (roles[i].cls || "")}>{roles[i].text}</span>
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
    if (n.includes("parte 1") || n.includes("parte1")) return { text: "Parte 1", cls: "ok" };
    if (n.includes("parte 2") || n.includes("parte2")) return { text: "Parte 2", cls: "ok" };
    return { text: "se detecta al procesar", cls: "" };
  });

  const go = (t) => { setTab(t); setStatus(null); };

  const StatusBox = () =>
    status ? (
      <div className={"status " + (status.type === "err" ? "err" : status.type === "ok" ? "ok" : "")}>
        {busy && <span className="spinner" />}
        {status.msg}
      </div>
    ) : null;

  return (
    <div className="stage">
      <div className="card">
        <div className="head">
          <Logo />
          <div>
            <h1>movil<span>net</span></h1>
            <span className="tag">Procesador de KPIs</span>
          </div>
        </div>

        <div className="seg">
          <button className={tab === "umts" ? "on" : ""} onClick={() => go("umts")}>
            UMTS <b>· Antes/Después</b>
          </button>
          <button className={tab === "lte" ? "on" : ""} onClick={() => go("lte")}>
            LTE <small>· Promedios</small>
          </button>
        </div>

        {tab === "umts" && (
          <>
            <div className="title">Comparativa UMTS</div>
            <div className="sub">
              Sube los dos archivos (Parte 1 y Parte 2), elige las fechas y descarga la tabla lista.
            </div>

            <FileDrop
              label="Arrastra los 2 archivos aquí"
              sublabel="Parte 1 y Parte 2 · .xlsx · el orden no importa"
              multiple={true}
              files={umtsFiles}
              onFiles={(f) => setUmtsFiles(f.slice(-2))}
              roles={umtsRoles}
            />

            <div className="dates">
              <div className="dtcol">
                <label><span className="dot antes" />Antes</label>
                <div className="two">
                  <input className="inp" type="date" value={aStart} onChange={(e) => setAStart(e.target.value)} />
                  <input className="inp" type="date" value={aEnd} onChange={(e) => setAEnd(e.target.value)} />
                </div>
              </div>
              <div className="dtcol">
                <label><span className="dot despues" />Después</label>
                <div className="two">
                  <input className="inp" type="date" value={bStart} onChange={(e) => setBStart(e.target.value)} />
                  <input className="inp" type="date" value={bEnd} onChange={(e) => setBEnd(e.target.value)} />
                </div>
              </div>
            </div>

            <button className="cta" disabled={busy || umtsFiles.length < 2} onClick={runUMTS}>
              {busy ? "Procesando…" : "Generar Excel comparativo"}
            </button>
            <StatusBox />
          </>
        )}

        {tab === "lte" && (
          <>
            <div className="title">Promedios LTE</div>
            <div className="sub">
              Sube un archivo LTE, elige el rango de fechas y descarga la tabla de promedios por celda.
            </div>

            <FileDrop
              label="Arrastra el archivo aquí"
              sublabel="Un solo Excel · .xlsx"
              multiple={false}
              files={lteFiles}
              onFiles={(f) => setLteFiles(f.slice(-1))}
            />

            <div className="dates single">
              <div className="dtcol">
                <label>Rango de fechas</label>
                <div className="two">
                  <input className="inp" type="date" value={lteStart} onChange={(e) => setLteStart(e.target.value)} />
                  <input className="inp" type="date" value={lteEnd} onChange={(e) => setLteEnd(e.target.value)} />
                </div>
              </div>
            </div>

            <button className="cta" disabled={busy || lteFiles.length === 0} onClick={runLTE}>
              {busy ? "Procesando…" : "Generar Excel LTE"}
            </button>
            <StatusBox />
          </>
        )}

        <div className="foot">
          <span className="dotp" />
          100% local · los archivos no se suben a ningún servidor
        </div>
      </div>
    </div>
  );
}
