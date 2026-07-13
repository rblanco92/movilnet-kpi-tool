# Movilnet · Procesador de KPIs LTE / UMTS

Web app para que cualquier persona suba los reportes de Excel, elija el rango de
fechas y descargue la tabla de promedios lista. **Todo el procesamiento ocurre en
el navegador del usuario**, así que:

- No hay límites de tamaño de subida ni de tiempo de servidor.
- Los datos **no se suben a ningún servidor**: privacidad total.
- El hosting en Vercel es gratis (es un sitio estático + JS).

### Lectura en streaming (importante)

Estos reportes son pequeños comprimidos (~12 MB) pero descomprimen a un XML de
**cientos de MB** (más de 500 MB en el caso de UMTS Parte 2). Eso supera el
límite de tamaño de string de los navegadores, por lo que las librerías típicas
de Excel fallan. Por eso el lector (`lib/process.js`) usa **fflate** para
descomprimir en trozos y parsea el archivo **fila por fila**, agregando los
promedios al vuelo sin cargar todo en memoria. Probado con +280 mil filas.

## Qué hace

**UMTS · Comparativa Antes/Despues**
- Subes los archivos (mínimo una Parte 1 y una Parte 2; puedes subir **varias de
  cada una** y se unen). Se detecta solo cuál es cada una y el orden no importa.
- Eliges dos rangos de fechas: "Antes" y "Despues".
- Agrupa por `cellid` + `sector`, combinando los sectores
  **1/4/7→1, 2/5/8→2, 3/6/9→3**.
- **Promedia** 9 métricas (Disponibilidad UMTS, U_HSDPA.UE.Mean.Cell,
  CS_ServiceDropRatio, PS_CallDropRatio_OptRF, Retención Datos, Retención Voz,
  Accesibilidad Voz, Accesibilidad Datos, U_HSDPA.MeanChThroughput), calcula la
  **suma** de CS_TRAFFIC_UMTS (Erl) y la **suma÷1000** de TraficoPS (MB).
- Genera una sola tabla con columnas Antes | Despues lado a lado.

**LTE · Promedios**
- Subes uno o **varios** archivos LTE (se combinan).
- Eliges un rango de fechas.
- Extrae `eNodeB Function Name` y `Local Cell ID` de la columna "Cell", agrupa y
  promedia 6 métricas.

**Formatos soportados (UMTS).** La app se adapta automáticamente a dos variantes:
- Con o sin filas de **preámbulo** antes del encabezado (busca la fila cuyo
  primer valor es "Start Time").
- `cellid` y `sector` como columnas propias, **o** embebidos en la columna
  `BSC6900UCell` (ej. `Label=CS3083D, CellID=30834` → `cellid=3083`, `sector=4`,
  tomando `cellid = CellID // 10` y `sector = CellID % 10`).

Los valores de texto tipo `NIL` se ignoran en los promedios (no cuentan como 0).

## Probar en local

Necesitas Node.js 18 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:3000

## Desplegar en Vercel

### Opción A — desde la web (recomendada, sin instalar nada)

1. Sube esta carpeta a un repositorio de GitHub (nuevo repo → arrastra los
   archivos, o `git init && git add . && git commit && git push`).
2. Entra a https://vercel.com, inicia sesión y pulsa **Add New… → Project**.
3. Importa el repositorio. Vercel detecta Next.js automáticamente.
4. Pulsa **Deploy**. En ~1 minuto tendrás una URL pública que puedes compartir.

### Opción B — desde la terminal (Vercel CLI)

```bash
npm i -g vercel
vercel        # sigue las preguntas; primera vez enlaza el proyecto
vercel --prod # publica en producción
```

No hay variables de entorno que configurar.

## Estructura

```
app/
  layout.jsx     tipografías y metadatos
  page.jsx       interfaz (pestañas LTE / UMTS, carga, fechas, botón)
  globals.css    estilos (identidad Movilnet)
lib/
  process.js     lógica: lectura xlsx en streaming (fflate), filtros,
                 agrupación, promedios y generación del Excel con formato
```

## Ajustes rápidos

- **Cambiar métricas o nombres de columna:** edita las constantes `LTE_METRICS`
  y `UMTS_METRICS` en `lib/process.js`.
- **Cambiar la regla de sectores:** edita el objeto `SMAP` en `lib/process.js`.
- **Cambiar promedio vs. suma÷1000:** el campo `agg` de cada métrica en
  `UMTS_METRICS` (`"avg"` o `"sum1000"`).
- **Colores/estilo del Excel:** constantes `RED`, `ANTES`, `DESPUES`, etc. en
  `lib/process.js`.
