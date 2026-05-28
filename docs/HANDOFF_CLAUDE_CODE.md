# 🥩 The Butcher — Handoff para Claude Code (v2 — COMPLETO)

> **Tarea:** Agregar botón **"Editar"** a cada pedido en la pantalla "Ver
> todos los pedidos", para corregir pedidos cargados con error. Al guardar,
> debe actualizar **Firebase Firestore** Y **Google Sheets**.
>
> Confirmado por Santi: editar TODOS los campos (cliente, fecha, vendedor,
> tipo de entrega, items, logística, descuento), cualquiera del equipo puede
> editar, cualquier pedido (incluso pagados), y debe sincronizar a Sheets.

---

## 1. STACK Y ACCESOS

| Pieza | Detalle |
|-------|---------|
| Frontend | Un solo `index.html` (HTML+CSS+JS embebido). App v3.3 |
| Librerías | XLSX.js 0.18.5, html2canvas 1.4.1 (CDN) |
| Base de datos | Firebase Firestore — proyecto `butcher-pedidos` |
| Sheets | Google Apps Script Web App (v4) sobre hoja "Sales" |
| Repo | `github.com/lafondiatta-hub/butcher-pedidos` |
| App en vivo | https://lafondiatta-hub.github.io/butcher-pedidos/ |
| Spreadsheet ID | `1pcKBQ2lXeG-VR_77NJN_P5KNYsc5KK-oWv8wDb0ClCY` ("[The Butcher] Sales") |
| Apps Script | Vive DENTRO del Sheet → Extensiones → Apps Script |

---

## 2. MAPEO REAL DE LAS 19 COLUMNAS (hoja "Sales")

| Col | # | Campo | Qué escribe el Apps Script |
|-----|---|-------|----------------------------|
| A | 1 | N° | autoincrement (lo calcula el script) |
| B | 2 | Mes venta | primer día del mes de la fecha |
| C | 3 | Fecha de pedido | `pedido.fecha` |
| D | 4 | Fecha de entrega | `pedido.fechaEntrega` o = fecha pedido |
| E | 5 | Vendedor | `pedido.vendedor` |
| F | 6 | **Cliente** | `pedido.cliente` ← columna clave de búsqueda |
| G | 7 | Teléfono | `pedido.telefono` |
| H | 8 | Dirección | `pedido.direccion` |
| I | 9 | Envío | "Delivery" / "Retira" |
| J | 10 | Precio envío | (vacío) |
| K | 11 | Subtotal | `pedido.subtotalPedido` |
| L | 12 | Descuento | `pedido.descuentoMonto` |
| M | 13 | Comisiones | (vacío) |
| N | 14 | Venta neta | `pedido.totalFinal` |
| O | 15 | Modalidad de pago | `pedido.metodoPago` |
| P | 16 | Quien Cobró / Fecha cobro | (lo usa actualizarPago p/ fecha) |
| Q | 17 | Confirmación de pago | "Pagado"/"Parcial"/"Pendiente" |
| R | 18 | Stock | (vacío) |
| S | 19 | Comentarios | items + horario + notas, separados por ` \| ` |
| T | 20 | **ID App** (v5.2) | `pedido.id` ("PED-...") ← clave de match Firebase ↔ Sheets |

> ⚠️ Los **items NO van en columna propia**: se guardan como TEXTO en la
> columna S (Comentarios), con formato `Producto (1.250kg), Otro (2u) | ⏰ horario`.
> El reporte mensual luego PARSEA ese texto. Si editás items, hay que
> regenerar ese string igual que en `guardarPedido`.

---

## 3. EL PROBLEMA DE IDENTIDAD (clave para editar)

**Firebase y Sheets NO comparten un ID común.**
- En Firebase cada pedido tiene `_id` (Firestore) e `id` ("PED-...").
- En Sheets el `N°` (col A) lo genera el propio Apps Script al guardar.
- La app **nunca manda** el N° a Sheets, ni guarda en Firebase qué fila/N°
  le tocó en Sheets.

➡️ Por eso, tal como hace la acción `actualizarPago`, la edición debe
**ubicar la fila por Cliente (col F) + Fecha (col C)**, no por ID.

**Riesgo:** si el usuario edita el cliente o la fecha, después no se puede
volver a encontrar esa fila. **Solución implementada en el código nuevo:** la
app manda `clienteOriginal` + `fechaOriginal` (los valores ANTERIORES) para
ubicar la fila, y dentro escribe los valores nuevos. Conservá esos originales
en el front antes de abrir el modal de edición.

> **Mejora futura recomendada (opcional):** que `guardarPedido` devuelva el
> `numPedido`/`fila` y la app lo guarde en Firebase (`sheetRow`, `sheetNum`).
> Así la edición sería por fila exacta y desaparecería el riesgo. No es
> necesario para la v1.

### ✅ v5.2 — Match por ID (resuelto)

Ya **comparten un ID**: `guardarPedido` escribe `pedido.id` ("PED-...") en la
**columna T (20, "ID App")**. El helper `buscarFilaPedido()` ubica la fila con
esta prioridad: (1) ID de app, (2) cliente + fecha exacta, (3) cliente más
reciente (fallback). Lo usan `actualizarPago`, `editarPedido` y la nueva acción
`sincronizarCobros`. Las filas viejas sin ID se completan automáticamente (backfill)
la primera vez que matchean por cliente+fecha.

**`sincronizarCobros`** (reconciliación masiva): la app manda todos los pedidos
`pagado`/`parcial` de Firebase y el script actualiza en Sales las filas que sigan
pendientes. Botón "🔄 Sincronizar cobros con Sheets" en la vista Seguimiento.

---

## 4. ESTRUCTURA DEL PEDIDO EN FIREBASE (shape real)

```js
{
  id: "PED-1716300000000", cliente, telefono, direccion,
  fecha: "YYYY-MM-DD", vendedor, listaPrecios,
  items: [{ producto, tipo:"kg"|"unidad", pesoOCantidad, precio, subtotal }],
  logistica: 0, tipoEnvio:"retiro"|"delivery", fechaEntrega:"", horario:"",
  subtotalPedido, descuentoPct, descuentoMonto, totalFinal,
  alias, titular, timestamp,
  estado:"pendiente"|"parcial"|"pagado", metodoPago, fechaPago,
  notasCobro, montoParcial,
  _id: "<firestore id, NO se guarda, lo agrega el front al leer>"
}
```

---

## 5. PLAN DE IMPLEMENTACIÓN

### FRONTEND (index.html)

**A. Botón en la card** — en `renderPedidoCard(p)`, la grilla de 3 botones
pasa a 4 (o se agrega una segunda fila). Nuevo botón:
```js
<button class="btn-chip" onclick="abrirEdicionPedido('${p._id}')">✏️ Editar</button>
```

**B. Variables globales nuevas** (junto a las otras, arriba):
```js
let editandoPedidoId = null;
let pedidoOriginalSheets = null; // { cliente, fecha } ANTES de editar
```

**C. `abrirEdicionPedido(id)`** — la forma más práctica (reusa todo lo que
ya existe):
1. Buscar `p = pedidos.find(x => x._id === id)`.
2. Guardar `editandoPedidoId = id` y
   `pedidoOriginalSheets = { cliente: p.cliente, fecha: p.fecha }`.
3. Llamar `renderApp()` (la pantalla de carga) y DESPUÉS precargar:
   - `carrito = [...p.items]`
   - `logisticaMonto = p.logistica`, `window._logisticaAgregada = p.logistica>0`
   - `tipoEnvio = p.tipoEnvio`, `horarioSeleccionado = p.horario`
   - inputs: cliente, telefono, direccion, fecha, vendedor, descuento,
     fechaEntrega; llamar `seleccionarEnvio(p.tipoEnvio)` y marcar horario.
   - `renderCarrito()` + `actualizarTotales()`.
4. Cambiar el botón "📄 Generar Resumen" → "💾 Guardar cambios".

**D. En `generarResumen()`** — al principio:
```js
if (editandoPedidoId) { return guardarEdicionPedido(); }
```

**E. `guardarEdicionPedido()`** (función nueva):
1. Reconstruir `pedido` con datos nuevos, **conservando** del original:
   `id`, `timestamp`, `estado`, `metodoPago`, `fechaPago`, `montoParcial`.
2. Firebase: `updateDoc(doc(db,'pedidos',editandoPedidoId), pedido)`.
3. Sheets (si hay `config.sheetsUrl`): POST con
   ```js
   { action:'editarPedido',
     clienteOriginal: pedidoOriginalSheets.cliente,
     fechaOriginal: pedidoOriginalSheets.fecha,
     pedido }
   ```
   👉 Reusar el patrón de fetch de `enviarAGoogleSheets()` (maneja 302 + no-cors).
4. `editandoPedidoId = null; pedidoOriginalSheets = null;`
5. `showToast('✅ Pedido editado')` y `renderPedidos()`.

> Nota: `onSnapshot` redibuja la lista sola tras el `updateDoc`. No fuerces re-render de Firebase.

**F. Ojo con `volverAPedidos()` / reset** — al cancelar una edición, limpiar
también `editandoPedidoId` y `pedidoOriginalSheets`.

### BACKEND (Apps Script) — archivo `AppsScript_editarPedido.gs`
1. En `doPost`, sumar:
   ```js
   } else if (action === 'editarPedido') {
     result = editarPedido(data);
   ```
2. Pegar la función `editarPedido(data)` + el helper `normalizarFecha(valor)`
   (ambos en el .gs adjunto).
3. **Guardar → Implementar → NUEVA implementación** (no editar la existente).
4. Copiar la URL `/exec` nueva → pegarla en la app (Configuración).

---

## 6. BUGS / PENDIENTES QUE ENCONTRÉ EN EL CÓDIGO ACTUAL

1. 🐞 **`generarReporteMensual` usa `filasTotal` sin declararla** (hace
   `filasTotal++` y no existe `var filasTotal = 0`). Puede romper el reporte.
   Arreglo: declarar `var filasTotal = 0;` arriba del loop. *(de paso)*
2. 🧹 **Filas reservadas/vacías en la hoja Sales** (N° y subtotal=0 sin
   cliente) que ensucian `getLastRow()`. Por eso el código escanea col F.
   Pendiente histórico: borrar esas filas. No bloquea editar.
3. 📌 La columna P se usa ambiguamente: header dice "Quien Cobró el FT" pero
   `actualizarPago` escribe ahí la **fecha de cobro**. Tenerlo presente.

---

## 7. QUIRKS (no reaprender a los golpes)

- POST a Apps Script devuelve **302** → `redirect:'follow'` +
  `Content-Type:'text/plain;charset=utf-8'`. CORS → fallback `mode:'no-cors'`.
  Ya implementado en `enviarAGoogleSheets()` — copiar ese patrón.
- Deploy: "Ejecutar como: Yo" / "Acceso: Cualquier persona" (NO "con cuenta
  Google" → 403). Cada cambio = **nueva implementación** → nueva URL `/exec`.
- `getLastRow()` poco confiable → escanear col F desde abajo (ya se hace).
- Comillas tipográficas de Mac (" " ' ') rompen el JS al copiar/pegar.
- `_id` (Firebase) vs `id` PED- (lógico) vs `N°` (Sheets, lo pone el script).

---

## 8. MAPA DE FUNCIONES DEL HTML

| Función | Rol |
|---------|-----|
| `renderApp()` | pantalla de carga (reusar para precargar en modo edición) |
| `renderPedidos()` / `renderPedidoCard(p)` | lista + card (← botón Editar acá) |
| `generarResumen()` | arma y guarda el pedido (← branch a editar acá) |
| `guardarPedidoEnFirebase(p)` | escribe en Firestore |
| `enviarAGoogleSheets(p)` / `actualizarPagoEnSheets(...)` | POST a Apps Script (copiar patrón) |
| `abrirModalEditar(idx)` | ⚠️ edita un ITEM del carrito, NO el pedido (no confundir) |
| `seleccionarEnvio()` / `seleccionarHorario()` | delivery/retiro |

---

*Handoff generado a partir del código real: index.html v3.3 + Apps Script v4.*
