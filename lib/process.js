import { unzipSync, Unzip, UnzipInflate } from "fflate";
import ExcelJS from "exceljs";

/* ============================================================
   Lector XLSX en streaming
   ------------------------------------------------------------
   Los reportes descomprimen a XML de cientos de MB, lo que supera
   el límite de tamaño de string de los navegadores. Por eso NO se
   carga el archivo completo: se descomprime en trozos y se parsea
   fila por fila, agregando al vuelo (memoria mínima).
   ============================================================ */

function colToIdx(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++)
    n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(u8) {
  if (!u8) return [];
  const xml = new TextDecoder().decode(u8);
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    let s = "";
    const tre = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tre.exec(m[1]))) s += tm[1];
    out.push(decodeEntities(s));
  }
  return out;
}

function excelSerialToDate(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds()
  );
}

async function getZip(file) {
  const ab = await file.arrayBuffer();
  const zipU8 = new Uint8Array(ab);
  let sharedStrings = [];
  try {
    const filtered = unzipSync(zipU8, {
      filter: (f) => f.name === "xl/sharedStrings.xml",
    });
    sharedStrings = parseSharedStrings(filtered["xl/sharedStrings.xml"]);
  } catch (e) {
    sharedStrings = [];
  }
  return { zipU8, sharedStrings };
}

// Recorre la primera hoja llamando onRow(arr) por fila (arr indexado por columna).
function streamSheet(zipU8, sst, onRow, onProgress) {
  return new Promise((resolve, reject) => {
    const dec = new TextDecoder("utf-8");
    let buf = "";
    let started = false;
    let count = 0;
    let errored = false;
    const cellRe = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

    function handleRow(rowXml) {
      const arr = [];
      let m;
      cellRe.lastIndex = 0;
      while ((m = cellRe.exec(rowXml))) {
        const ci = colToIdx(m[1]);
        const attrs = m[2] || "";
        const inner = m[3];
        const tMatch = attrs.match(/t="([^"]+)"/);
        const t = tMatch ? tMatch[1] : null;
        let val = null;
        if (inner != null) {
          if (t === "inlineStr") {
            const im = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
            val = im ? decodeEntities(im[1]) : "";
          } else {
            const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
            if (vm) {
              if (t === "s") val = sst[+vm[1]];
              else if (t === "str") val = decodeEntities(vm[1]);
              else val = parseFloat(vm[1]);
            }
          }
        }
        arr[ci] = val;
      }
      onRow(arr);
      count++;
      if (onProgress && count % 50000 === 0) onProgress(count);
    }

    function flush() {
      let idx;
      while ((idx = buf.indexOf("</row>")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 6);
        const rs = chunk.lastIndexOf("<row");
        if (rs === -1) continue;
        handleRow(chunk.slice(rs));
      }
    }

    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (fileEntry) => {
      if (started) return;
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(fileEntry.name)) {
        started = true;
        fileEntry.ondata = (err, chunk, final) => {
          if (errored) return;
          if (err) {
            errored = true;
            reject(err);
            return;
          }
          try {
            buf += dec.decode(chunk, { stream: !final });
            flush();
            if (final) resolve(count);
          } catch (e) {
            errored = true;
            reject(e);
          }
        };
        fileEntry.start();
      }
    };

    try {
      const CH = 262144;
      for (let off = 0; off < zipU8.length; off += CH) {
        const end = Math.min(off + CH, zipU8.length);
        unzip.push(zipU8.subarray(off, end), end >= zipU8.length);
        if (errored) return;
      }
    } catch (e) {
      if (!errored) reject(e);
      return;
    }
    if (!started)
      reject(new Error("No se encontró la hoja de datos en el archivo."));
  });
}

/* ============================================================
   Utilidades comunes
   ============================================================ */
function parseDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return excelSerialToDate(v);
  if (typeof v === "string") {
    const m = v.match(
      /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (m)
      return new Date(
        +m[1],
        +m[2] - 1,
        +m[3],
        +(m[4] || 0),
        +(m[5] || 0),
        +(m[6] || 0)
      );
    const m2 = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);
  }
  return null;
}

function rangeBounds(startStr, endStr) {
  const s = startStr.split("-").map(Number);
  const e = endStr.split("-").map(Number);
  return {
    start: new Date(s[0], s[1] - 1, s[2], 0, 0, 0, 0),
    end: new Date(e[0], e[1] - 1, e[2], 23, 59, 59, 999),
  };
}

function colIndex(headers, name) {
  const target = name.trim().toLowerCase();
  return headers.findIndex((h) => String(h).trim().toLowerCase() === target);
}

// ¿Es esta fila el encabezado real? (primera celda == "Start Time")
function isHeaderRow(row) {
  return (
    row &&
    row[0] != null &&
    String(row[0]).trim().toLowerCase() === "start time"
  );
}

function isNum(v) {
  return typeof v === "number" && !isNaN(v) && isFinite(v);
}

function toInt(v) {
  if (typeof v === "number") return Math.trunc(v);
  const n = parseInt(v);
  return isNaN(n) ? null : n;
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  let s = 0;
  for (const x of arr) s += x;
  return Math.round((s / arr.length) * 1000) / 1000;
}

function triggerDownload(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ============================================================
   Estilos ExcelJS (identidad Movilnet)
   ============================================================ */
const RED = "FFE8434E";
const RED_SOFT = "FFFBE3E5";
const ANTES = "FFEAF2FB";
const DESPUES = "FFFDEEE7";
const WHITE = "FFFFFFFF";
const BORDER = "FFD8DEE4";

const thinBorder = {
  top: { style: "thin", color: { argb: BORDER } },
  left: { style: "thin", color: { argb: BORDER } },
  bottom: { style: "thin", color: { argb: BORDER } },
  right: { style: "thin", color: { argb: BORDER } },
};

function fill(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/* ============================================================
   PRESET LTE  (acepta 1 o varios archivos; se unen)
   ============================================================ */
const LTE_METRICS = [
  ["Disponibilidad", "Disponibilidad_de_la_Celda_OPTRF (%)"],
  ["Numero Promedio de Usuarios", "Numero_Promedio_de_Usuarios_OPTRF (number)"],
  ["Volumen de Trafico DL", "Volumen_de_Trafico_DL_MB_OPTRF (MB)"],
  ["Accesibilidad RF", "Accesibilidad RF (%) - LB (%)"],
  ["Retencion", "Retencion (%) - LB (%)"],
  ["ResourceBlockUtilizingRate_DL", "ResourceBlockUtilizingRate_DL (%)"],
];

export async function processLTE(files, startStr, endStr, onProgress) {
  const list = Array.isArray(files) ? files : [files];
  if (!list.length) throw new Error("Sube al menos un archivo LTE.");
  const { start, end } = rangeBounds(startStr, endStr);

  const groups = new Map();
  let kept = 0;

  for (let f = 0; f < list.length; f++) {
    const file = list[f];
    onProgress && onProgress(`Leyendo ${file.name}…`);
    const { zipU8, sharedStrings } = await getZip(file);

    let ready = false;
    let cStart = -1,
      cCell = -1,
      metricCols = null;

    await streamSheet(
      zipU8,
      sharedStrings,
      (row) => {
        if (!ready) {
          if (!isHeaderRow(row)) return; // saltar preámbulo
          const header = row.map((x) => (x == null ? "" : String(x).trim()));
          cStart = colIndex(header, "Start Time");
          cCell = colIndex(header, "Cell");
          if (cCell < 0)
            throw new Error(`No se encontró la columna "Cell" en "${file.name}".`);
          metricCols = LTE_METRICS.map(([label, hname]) => {
            const idx = colIndex(header, hname);
            if (idx < 0)
              throw new Error(`No se encontró "${hname}" en "${file.name}".`);
            return { label, idx };
          });
          ready = true;
          return;
        }
        const dt = parseDate(row[cStart]);
        if (!dt || dt < start || dt > end) return;
        kept++;
        const cell = row[cCell] == null ? "" : String(row[cCell]);
        const m1 = cell.match(/eNodeB Function Name=([^,]+)/i);
        const m2 = cell.match(/Local Cell ID=([^,]+)/i);
        const enb = m1 ? m1[1].trim() : "";
        const lcid = m2 ? m2[1].trim() : "";
        const key = enb + "||" + lcid;
        let g = groups.get(key);
        if (!g) {
          g = { enb, lcid, metrics: metricCols.map(() => []) };
          groups.set(key, g);
        }
        for (let i = 0; i < metricCols.length; i++) {
          const v = row[metricCols[i].idx];
          if (isNum(v)) g.metrics[i].push(v);
        }
      },
      (n) =>
        onProgress &&
        onProgress(`Procesando ${file.name}… ${n.toLocaleString()} filas`)
    );

    if (!ready)
      throw new Error(`No se encontró el encabezado (Start Time) en "${file.name}".`);
  }

  if (groups.size === 0)
    throw new Error("No hay datos en el rango de fechas seleccionado.");

  const keys = [...groups.keys()].sort((a, b) => {
    const ga = groups.get(a),
      gb = groups.get(b);
    if (ga.enb !== gb.enb) return ga.enb < gb.enb ? -1 : 1;
    return (parseInt(ga.lcid) || 9999) - (parseInt(gb.lcid) || 9999);
  });

  onProgress && onProgress("Generando Excel…");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Promedios");
  ws.addRow([
    "eNodeB Function Name",
    "Local Cell ID",
    ...LTE_METRICS.map((m) => m[0]),
  ]);
  for (const key of keys) {
    const g = groups.get(key);
    const rowVals = [g.enb, g.lcid === "" ? "" : parseInt(g.lcid) || g.lcid];
    for (let i = 0; i < LTE_METRICS.length; i++) rowVals.push(avg(g.metrics[i]));
    ws.addRow(rowVals);
  }

  const hr = ws.getRow(1);
  hr.height = 40;
  hr.eachCell((cell) => {
    cell.fill = fill(RED);
    cell.font = { bold: true, color: { argb: WHITE }, size: 11, name: "Roboto" };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  });
  for (let r = 2; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell((cell, col) => {
      cell.border = thinBorder;
      if (col >= 3) {
        cell.numFmt = "0.000";
        cell.alignment = { horizontal: "center" };
        if (r % 2 === 1) cell.fill = fill(RED_SOFT);
      } else {
        cell.alignment = { horizontal: col === 2 ? "center" : "left" };
      }
    });
  }
  const widths = [44, 14, 16, 26, 22, 16, 14, 30];
  ws.columns.forEach((c, i) => {
    c.width = widths[i] || 16;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const fname = `Promedios_LTE_${startStr}_a_${endStr}.xlsx`;
  triggerDownload(buffer, fname);
  return { groups: groups.size, kept, filename: fname };
}

/* ============================================================
   PRESET UMTS (comparativa Antes / Despues; multi-archivo)
   ============================================================ */
// Sectores 1-9 combinados: 1,4,7 -> 1 | 2,5,8 -> 2 | 3,6,9 -> 3
const SMAP = { 1: 1, 4: 1, 7: 1, 2: 2, 5: 2, 8: 2, 3: 3, 6: 3, 9: 3 };

// agg: "avg" = promedio | "sum1000" = suma de todos los datos / 1000
const UMTS_METRICS = [
  { label: "Disponibilidad UMTS (%)", header: "Disponibilidad UMTS (%)", part: 1, agg: "avg" },
  { label: "U_HSDPA.UE.Mean.Cell", header: "U_VS.HSDPA.UE.Mean.Cell (None)", part: 1, agg: "avg" },
  { label: "CS_ServiceDropRatio (%)", header: "CS_ServiceDropRatio (%)", part: 1, agg: "avg" },
  { label: "PS_CallDropRatio_OptRF (%)", header: "PS_CallDropRatio_OptRF (%)", part: 1, agg: "avg" },
  { label: "Retencion Datos (%)", header: "Retencion Datos (%)", part: 1, agg: "avg" },
  { label: "Retencion Voz (%)", header: "Retencion Voz (%)", part: 1, agg: "avg" },
  { label: "Accesibilidad Voz (%)", header: "Accesibilidad Voz (%) - LB (%)", part: 2, agg: "avg" },
  { label: "Accesibilidad Datos (%)", header: "Accesibilidad Datos (%) - LB (%)", part: 2, agg: "avg" },
  { label: "U_HSDPA.MeanChThroughput (kbit/s)", header: "U_VS.HSDPA.MeanChThroughput (kbit/s)", part: 1, agg: "avg" },
  { label: "CS_TRAFFIC_UMTS (Erl) Σ", header: "CS_TRAFFIC_UMTS (Erl)", part: 1, agg: "sum" },
  { label: "TraficoPS (MB) Σ/1000", header: "TraficoPS (MB)", part: 1, agg: "sum1000" },
];

function aggValue(arr, agg) {
  if (!arr || !arr.length) return null;
  if (agg === "sum" || agg === "sum1000") {
    let s = 0;
    for (const x of arr) s += x;
    if (agg === "sum1000") s = s / 1000;
    return Math.round(s * 1000) / 1000;
  }
  return avg(arr);
}

function detectPart(headers) {
  if (colIndex(headers, "CS_TRAFFIC_UMTS (Erl)") >= 0) return 1;
  if (colIndex(headers, "Accesibilidad Voz (%) - LB (%)") >= 0) return 2;
  return 0;
}

// Devuelve una función que extrae [cellid, sector] de una fila, según el formato:
//  - columnas 'cellid' + 'sector' (formato clásico), o
//  - columna 'BSC6900UCell' con "…CellID=NNNNN" (cellid = NNNNN/10, sector = NNNNN%10)
function makeKeyExtractor(header, fileName) {
  const cCell = colIndex(header, "cellid");
  const cSector = colIndex(header, "sector");
  if (cCell >= 0 && cSector >= 0) {
    return (row) => [toInt(row[cCell]), toInt(row[cSector])];
  }
  const cBSC = colIndex(header, "BSC6900UCell");
  if (cBSC >= 0) {
    return (row) => {
      const m = String(row[cBSC] == null ? "" : row[cBSC]).match(/CellID=(\d+)/i);
      if (!m) return [null, null];
      const full = parseInt(m[1]);
      return [Math.trunc(full / 10), full % 10];
    };
  }
  throw new Error(
    `En "${fileName}" no se encontró cellid/sector ni BSC6900UCell.`
  );
}

export async function processUMTS(files, antes, despues, onProgress) {
  const list = Array.isArray(files) ? files : [files];
  if (list.length < 2)
    throw new Error("Sube al menos un archivo Parte 1 y uno Parte 2.");

  const A = rangeBounds(antes.start, antes.end);
  const B = rangeBounds(despues.start, despues.end);

  const data = new Map();
  const metricLabels = UMTS_METRICS.map((m) => m.label);
  function ensure(key, cellid, sector) {
    let g = data.get(key);
    if (!g) {
      g = {
        cellid,
        sector,
        antes: Object.fromEntries(metricLabels.map((l) => [l, []])),
        despues: Object.fromEntries(metricLabels.map((l) => [l, []])),
      };
      data.set(key, g);
    }
    return g;
  }

  const partsSeen = new Set();

  for (let f = 0; f < list.length; f++) {
    const file = list[f];
    onProgress && onProgress(`Leyendo ${file.name}…`);
    const { zipU8, sharedStrings } = await getZip(file);

    let ready = false;
    let part = 0;
    let cStart = -1,
      keyOf = null,
      metrics = null;

    await streamSheet(
      zipU8,
      sharedStrings,
      (row) => {
        if (!ready) {
          if (!isHeaderRow(row)) return; // saltar preámbulo
          const header = row.map((x) => (x == null ? "" : String(x).trim()));
          part = detectPart(header);
          if (part === 0)
            throw new Error(
              `El archivo "${file.name}" no parece ser UMTS Parte 1 ni Parte 2.`
            );
          partsSeen.add(part);
          cStart = colIndex(header, "Start Time");
          keyOf = makeKeyExtractor(header, file.name);
          metrics = UMTS_METRICS.filter((m) => m.part === part).map((m) => {
            const idx = colIndex(header, m.header);
            if (idx < 0)
              throw new Error(`No se encontró "${m.header}" en "${file.name}".`);
            return { label: m.label, idx };
          });
          ready = true;
          return;
        }
        const dt = parseDate(row[cStart]);
        if (!dt) return;
        let period = null;
        if (dt >= A.start && dt <= A.end) period = "antes";
        else if (dt >= B.start && dt <= B.end) period = "despues";
        else return;

        const [cellid, sec] = keyOf(row);
        if (cellid == null || sec == null) return;
        const msec = SMAP[sec] != null ? SMAP[sec] : sec;
        const key = cellid + "||" + msec;
        const g = ensure(key, cellid, msec);
        const bucket = g[period];
        for (let i = 0; i < metrics.length; i++) {
          const v = row[metrics[i].idx];
          if (isNum(v)) bucket[metrics[i].label].push(v);
        }
      },
      (n) =>
        onProgress &&
        onProgress(`Procesando ${file.name}… ${n.toLocaleString()} filas`)
    );

    if (!ready)
      throw new Error(`No se encontró el encabezado (Start Time) en "${file.name}".`);
  }

  if (!partsSeen.has(1) || !partsSeen.has(2))
    throw new Error(
      "Faltan datos: se necesita al menos un archivo Parte 1 y uno Parte 2."
    );
  if (data.size === 0)
    throw new Error("No hay datos en los rangos de fechas seleccionados.");

  const keys = [...data.keys()].sort((a, b) => {
    const ga = data.get(a),
      gb = data.get(b);
    const ca = typeof ga.cellid === "number" ? ga.cellid : 1e12;
    const cb = typeof gb.cellid === "number" ? gb.cellid : 1e12;
    if (ca !== cb) return ca - cb;
    return (ga.sector || 99) - (gb.sector || 99);
  });

  onProgress && onProgress("Generando Excel…");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Comparativa");

  ws.getCell(1, 1).value = "cellid";
  ws.getCell(1, 2).value = "sector";
  ws.mergeCells(1, 1, 2, 1);
  ws.mergeCells(1, 2, 2, 2);
  let col = 3;
  for (const m of UMTS_METRICS) {
    ws.getCell(1, col).value = m.label;
    ws.mergeCells(1, col, 1, col + 1);
    ws.getCell(2, col).value = "Antes";
    ws.getCell(2, col + 1).value = "Despues";
    col += 2;
  }
  const maxCol = 2 + UMTS_METRICS.length * 2;

  let rIdx = 3;
  for (const key of keys) {
    const g = data.get(key);
    const rowVals = [g.cellid, g.sector];
    for (const m of UMTS_METRICS) {
      rowVals.push(aggValue(g.antes[m.label], m.agg));
      rowVals.push(aggValue(g.despues[m.label], m.agg));
    }
    ws.getRow(rIdx).values = rowVals;
    rIdx++;
  }

  const r1 = ws.getRow(1);
  r1.height = 40;
  for (let c = 1; c <= maxCol; c++) {
    const cell = ws.getCell(1, c);
    cell.fill = fill(RED);
    cell.font = { bold: true, color: { argb: WHITE }, size: 10, name: "Roboto" };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  }
  for (let c = 1; c <= maxCol; c++) {
    const cell = ws.getCell(2, c);
    cell.font = { bold: true, size: 9, name: "Roboto" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
    if (cell.value === "Antes") cell.fill = fill(ANTES);
    else if (cell.value === "Despues") cell.fill = fill(DESPUES);
  }
  for (let r = 3; r < rIdx; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder;
      if (c >= 3) {
        cell.numFmt = "0.000";
        cell.alignment = { horizontal: "center" };
        cell.fill = fill((c - 3) % 2 === 0 ? ANTES : DESPUES);
      } else {
        cell.alignment = { horizontal: "center" };
      }
    }
  }
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 8;
  for (let c = 3; c <= maxCol; c++) ws.getColumn(c).width = 11;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 2 }];

  const buffer = await wb.xlsx.writeBuffer();
  const fname = "UMTS_Comparativa_Antes_Despues.xlsx";
  triggerDownload(buffer, fname);
  return { groups: data.size, filename: fname };
}
