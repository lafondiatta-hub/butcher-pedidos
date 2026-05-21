# 🥩 THE BUTCHER v3.4 — Activación paso a paso

> Frontend ya está deployado → https://lafondiatta-hub.github.io/butcher-pedidos/
> Falta activar el backend nuevo. **Tiempo: 5–10 min.**

---

## 📦 Qué sumamos

| Feature | Backend? |
|---|---|
| ✏️ Editar pedido | Sí (Apps Script v5) |
| ✍️ Producto manual | No, ya anda |
| 📝 Borrador sin peso | No, ya anda |
| ✏️ Horario libre | No, ya anda |
| 📅 Agendar en Calendar | No, ya anda |
| 📷 Cargar desde foto/texto (IA) | Sí (Apps Script v5 + API key) |

---

## 📁 Archivo que vas a usar

**Solo uno:** `docs/AppsScript_v5_completo.gs`

> Es un **reemplazo completo** del Apps Script v4 que tenés actualmente. Mantiene todo lo del v4 (`guardarPedido`, `actualizarPago`, `generarReporteMensual`), suma las 2 funciones nuevas (`editarPedido`, `extraerPedido`), y arregla un bug del v4 (`filasTotal` sin declarar en el reporte mensual).

---

## PASO A — Reemplazar el Apps Script

### A.1 — Abrir el editor

1. Sheet **"[The Butcher] Sales"** en Drive
2. Menú **Extensiones → Apps Script**

### A.2 — Borrar todo y pegar v5

1. **Cmd+A** en el editor del Apps Script → **Delete** (borra el v4 entero)
2. Abrí `docs/AppsScript_v5_completo.gs`
3. **Cmd+A** → **Cmd+C** (copiá todo el archivo)
4. Volvé al Apps Script → **Cmd+V** (pegá todo)
5. **Cmd+S** para guardar

> Esto es exactamente el mismo flujo que decía el header de tu v4 ("Borrá todo lo que haya y pegá este código"). No hay que ir a buscar líneas específicas.

---

## PASO B — API key de Gemini (solo si querés OCR)

> Si NO vas a usar la lectura de fotos/texto, salteate este paso.

### B.1 — Conseguir la key

1. https://aistudio.google.com/apikey
2. Logueate con **`lafondiatta@gmail.com`** (la misma cuenta del Apps Script)
3. **"Create API key"** → copiala

### B.2 — Pegarla en el Apps Script

1. En el Apps Script, columna izquierda → ⚙️ **Configuración del proyecto**
2. Bajá a **"Propiedades del secuencia de comandos"**
3. **"Agregar propiedad de secuencia de comandos"**
4. Completá:
   - **Nombre:** `GEMINI_API_KEY` (exactamente así)
   - **Valor:** (la key)
5. **Guardar propiedades**

**Costo:** Free tier = 15 reqs/min · 1.500 reqs/día. Te sobra.

---

## PASO C — Deploy

1. Arriba a la derecha: **Implementar → Nueva implementación**
2. ⚙️ junto al título → **Aplicación web**
3. Configurá:
   - **Descripción:** `v5 — editar + OCR`
   - **Ejecutar como:** Yo (`lafondiatta@gmail.com`)
   - **Quién tiene acceso:** **Cualquier persona** ⚠️ (NO "con cuenta Google" → da 403)
4. **Implementar**
5. Si pide permisos nuevos (UrlFetch / etc.) → aprobalos
6. **Copiá la URL nueva** (termina en `/exec`)

---

## PASO D — Pegar la URL en la app

1. Abrí https://lafondiatta-hub.github.io/butcher-pedidos/
2. **Cmd+Shift+R** para hard refresh (bajar la versión nueva)
3. **⚙️ Configuración**
4. Campo **🔗 URL Google Sheets** → pegá la URL del Paso C
5. **Guardar**

Debería decir: **✅ Config guardada · Google Sheets conectado**

---

## ✅ Tests rápidos

**Test 1 — Editar pedido**
1. Cargá un pedido, Generar Resumen
2. **Ver todos los pedidos** → click **✏️ Editar** en una card
3. Cambiá algo → **💾 Guardar cambios**
4. En el Sheet, la fila se actualiza conservando el N° original

**Test 2 — Producto manual + borrador**
1. **+ Agregar Producto** → **✍️ Agregar manualmente**
2. Nombre: "Hueso para caldo", Por kg, precio VACÍO, cantidad VACÍA
3. **Agregar** → ves badge **📝 BORRADOR** + tag **✍️ Manual**
4. Generar Resumen → la card aparece con badge **📝 BORRADOR**

**Test 3 — Horario libre**
1. Pedido con Delivery → **✏️ Otro horario…**
2. Escribí "9:30 a 11 hs"
3. En el Sheet, columna S verás `⏰ 9:30 a 11 hs`

**Test 4 — Calendar**
1. Después del resumen → **📅 Agendar en Google Calendar**
2. Preview de la ficha → **📅 Abrir en Calendar**
3. Cambiá el color a **Grafito** → Guardar

**Test 5 — OCR**
1. **📷 Cargar desde foto o texto (IA)**
2. Pegá: *"Hola, necesito 2 kg de asado, media docena de chorizos y 1 vacío. Lo entregan el viernes a la tarde en Av. Cabildo 1234, dpto 5C. Soy Juan Pérez, 1133334444."*
3. **🤖 Procesar con IA** (tarda 2-5 seg)
4. **✓ Aplicar al formulario**
5. El form se autocompleta

Para foto: arrastrá la imagen al modal o **Cmd+V** con la imagen copiada.

---

## 🚨 Si algo falla

| Síntoma | Solución |
|---|---|
| Editar dice "No se encontró el pedido" | El cliente/fecha en Firebase no matchea con Sheets — editás el Sheet a mano |
| OCR: "Falta GEMINI_API_KEY" | Volvé al Paso B.2 |
| OCR: "Gemini HTTP 403/400" | Regenerá la API key y pegala de nuevo |
| Apps Script da 403 desde la app | Nueva implementación con acceso = **Cualquier persona** (no "con cuenta Google") |
| No ves los botones nuevos en la app | **Cmd+Shift+R** (hard refresh) |
| "Configurá primero la URL" | Falta el Paso D |
| Algo del Apps Script anda raro | Editor → columna izquierda → **Ejecuciones** te muestra los logs |

---

Cuando arranques y te trabes en algún paso, mandame **qué hiciste hasta dónde** y **el error exacto** y vamos juntos.
