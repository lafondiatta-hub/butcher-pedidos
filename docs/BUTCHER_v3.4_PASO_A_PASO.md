# 🥩 THE BUTCHER v3.4 — Activación paso a paso

> Lo que sigue es **lo que te queda hacer a vos** para activar todo lo nuevo.
> El código del frontend ya está deployado en GitHub Pages (live).
> Tiempo estimado: **10–15 minutos**.

---

## 📦 Lo que viene en v3.4

| Feature | Qué hace | Estado |
|---|---|---|
| **✏️ Editar pedido** | Botón en cada card → editás cliente / fecha / items / total | Front listo, falta backend |
| **✍️ Producto manual** | Botón en el modal Agregar → cargás un producto que no está en el catálogo sin tocarlo | Front listo (no necesita backend) |
| **📝 Borrador sin peso** | Items con cantidad 0 o sin precio → quedan pendientes para completar después | Front listo (no necesita backend) |
| **✏️ Horario libre** | 5to botón "Otro…" en delivery → escribís el horario que quieras | Front listo (no necesita backend) |
| **📅 Agendar en Calendar** | Después del resumen → preview de la ficha + link a Google Calendar | Front listo (no necesita backend) |
| **📷 Cargar desde foto/texto (IA)** | Subís imagen o pegás texto → Gemini extrae los datos | Front listo, falta backend + API key |

---

## 📁 Archivos que vas a usar

Todos están en `~/Downloads/`:

| Archivo | Para qué | Usalo? |
|---|---|---|
| `AppsScript_butcher_pegar_de_una.gs` | **EL ÚNICO QUE NECESITÁS** — junta todo en un solo archivo con instrucciones | ✅ Sí |
| `AppsScript_editarPedido.gs` | Versión vieja, solo la función de editar | ❌ Podés borrarlo |
| `AppsScript_extraerPedido.gs` | Versión vieja, solo la función OCR | ❌ Podés borrarlo |
| `HANDOFF_CLAUDE_CODE.md` | Tu handoff original, queda como referencia histórica | 📚 Archivar |

> 🧹 **Limpieza opcional:** los 3 viejos los podés mover a `~/Documents/LaFondiatta/Archivo/` o borrarlos.

---

## PASO A — Activar `editarPedido` y `extraerPedido` en el Apps Script

### A.1 — Abrir el editor

1. Abrí el Sheet **"[The Butcher] Sales"** en Google Drive.
2. Menú **Extensiones → Apps Script**.
3. Se abre el editor con tu código actual (v4).

### A.2 — Sumar 4 líneas dentro de `doPost()`

Buscá tu función `doPost(e)`. Adentro hay un bloque tipo:

```js
if (action === 'guardarPedido') {
  result = guardarPedido(data);
} else if (action === 'actualizarPago') {
  result = actualizarPago(data);
} else if (action === 'generarReporteMensual') {
  ...
}
```

**Justo ANTES del cierre** (antes del último `}`), sumá:

```js
} else if (action === 'editarPedido') {
  result = editarPedido(data);
} else if (action === 'extraerPedido') {
  result = extraerPedido(data);
```

### A.3 — Pegar todo el código nuevo al final

1. Abrí el archivo `~/Downloads/AppsScript_butcher_pegar_de_una.gs`.
2. **Saltate todo el header de comentarios** (las primeras ~85 líneas con instrucciones).
3. Empezá a copiar desde donde dice:

```js
// ============================================================
// FUNCIÓN 1: editarPedido
// ============================================================
```

4. Copialo hasta el final del archivo.
5. En el Apps Script, andá al final de tu código (después de la última función existente) y pegá.
6. **Ctrl+S** (o Cmd+S) para guardar.

> ⚠️ Si tu Apps Script v4 ya tiene una función llamada `normalizarFecha`, va a chocar con esta. Por eso renombré la mía a `normalizarFechaParaButcher`. Si no tenés ninguna `normalizarFecha`, podés dejar todo como está, no hay conflicto.

---

## PASO B — Setear la API key de Gemini (solo si querés el OCR)

> ⏭️ **Si no vas a usar la lectura de fotos/texto, saltate este paso.** Lo demás funciona igual sin esto.

### B.1 — Conseguir la key

1. Andá a 👉 https://aistudio.google.com/apikey
2. Logueate con `lafondiatta@gmail.com` (importante: la misma cuenta del Apps Script).
3. Click **"Create API key"**.
4. Copiala (la guardás un segundo en algún lado).

### B.2 — Pegarla en el Apps Script

1. En el Apps Script, columna izquierda, click ⚙️ **Configuración del proyecto**.
2. Bajá hasta **"Propiedades del secuencia de comandos"**.
3. Click **"Agregar propiedad de secuencia de comandos"**.
4. Completá:
   - **Nombre:** `GEMINI_API_KEY` (exactamente así, sin espacios)
   - **Valor:** (pegá la key)
5. Click **Guardar propiedades**.

### B.3 — Sobre el costo

- Gemini 2.0 Flash en **free tier**: 15 requests/minuto · 1.500 requests/día.
- Con eso te alcanza para cargar pedidos todo el día sin pagar nada.
- Si en algún momento te quedás corto, la misma página te deja activar billing.

---

## PASO C — Deploy del Apps Script

### C.1 — Nueva implementación

1. Arriba a la derecha del editor: botón **Implementar**.
2. **Nueva implementación** (importante: NUEVA, no "Administrar implementaciones").
3. ⚙️ icono de engranaje al lado del título → **Aplicación web**.
4. Configurá:
   - **Descripción:** `v3.4 — editar + OCR` (opcional, te ayuda a recordar)
   - **Ejecutar como:** Yo (`lafondiatta@gmail.com`)
   - **Quién tiene acceso:** **Cualquier persona** ⚠️ (NO "Cualquier persona con cuenta de Google" → eso te da 403)
5. Click **Implementar**.
6. Si te pide permisos nuevos (CalendarApp / UrlFetch), aprobalos.
7. **Copiá la URL nueva** (la que termina en `/exec`).

> 📌 Cada vez que toques el código del Apps Script, hay que hacer una **NUEVA implementación** y actualizar la URL en la app. Las implementaciones viejas siguen activas pero apuntan al código viejo.

---

## PASO D — Pegar la URL en la app

1. Abrí 👉 https://lafondiatta-hub.github.io/butcher-pedidos/
2. (Si la app estaba abierta, refrescá con Cmd+Shift+R para bajar la versión nueva.)
3. Botón **⚙️ Configuración**.
4. Campo **🔗 URL Google Sheets (Apps Script)** → pegá la URL nueva del Paso C.
5. **Guardar**.
6. Te debería decir: **✅ Config guardada · Google Sheets conectado**.

---

## ✅ Cómo testear que todo anda

### Test 1 — Editar pedido (el del handoff)

1. Cargá cualquier pedido nuevo, dale Generar Resumen.
2. Andá a **📋 Ver todos los pedidos**.
3. En la card del pedido, click **✏️ Editar**.
4. El formulario aparece pre-cargado con los datos del pedido.
5. Aparece un banner naranja **"Editando pedido existente"**.
6. Cambiá algo (ej: la dirección o un peso).
7. Click **💾 Guardar cambios**.
8. Volvé al Sheet → verificá que la fila se actualizó **conservando el N° original**.

### Test 2 — Producto manual + borrador

1. Cargá un pedido nuevo.
2. Click **+ Agregar Producto**.
3. Click **✍️ ¿No está en el catálogo? Agregar manualmente**.
4. Poné nombre "Hueso para caldo", tipo Por kg, dejá el precio VACÍO.
5. **Dejá la cantidad VACÍA también**.
6. Click **Agregar**.
7. Volvés al carrito y ves el item con badge **📝 BORRADOR** + tag **✍️ Manual**.
8. Generá Resumen → la card del pedido aparece con badge **📝 BORRADOR**.
9. Editás después → completás cantidad/precio → ya no es borrador.

### Test 3 — Horario libre

1. Cargá pedido. Tipo de entrega: **Delivery**.
2. En horario, click **✏️ Otro horario…**.
3. Escribí "9:30 a 11 hs" (o lo que quieras).
4. Generá Resumen → en el Sheet, columna S (Comentarios) verás `⏰ 9:30 a 11 hs`.

### Test 4 — Agendar en Calendar

1. Después de generar un pedido con delivery + horario, en el resumen aparece **📅 Agendar en Google Calendar** (botón gris oscuro).
2. Click → se abre un modal con la ficha (preview).
3. Revisás → click **📅 Abrir en Calendar**.
4. Se abre Google Calendar con el evento pre-cargado.
5. Cambiá el color a **Grafito** (click en el círculo de color).
6. Guardar.

### Test 5 — Cargar desde foto/texto (OCR)

1. En la pantalla principal, click **📷 Cargar desde foto o texto (IA)**.
2. Pegá texto en el textarea, ej:
   > Hola, necesito 2 kg de asado, media docena de chorizos y 1 vacío. Lo entregan el viernes a la tarde en Av. Cabildo 1234, dpto 5C. Soy Juan Pérez, 1133334444.
3. Click **🤖 Procesar con IA**.
4. Tarda 2-5 segundos.
5. Aparece preview: cliente, teléfono, dirección, items, etc.
6. Click **✓ Aplicar al formulario**.
7. El form principal se autocompleta. Vos completás lo que falte (peso de items, fecha exacta, etc.).

> Para probar con imagen: arrastrá una foto de un pedido al modal, o usá Cmd+V con una imagen copiada.

---

## 🚨 Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Editar pedido falla con "No se encontró el pedido" | Cliente o fecha originales no matchean | Verificá que el pedido en Firebase tiene el mismo cliente/fecha que en Sheets. Si no, editás el Sheet a mano. |
| OCR dice "Falta GEMINI_API_KEY" | No setea-ste la key en Propiedades del script | Paso B.2 |
| OCR dice "Gemini HTTP 403" o "400" | API key inválida o sin permisos | Volvé a generar la key en aistudio.google.com/apikey y pegala de nuevo |
| Apps Script da 403 desde la app | Deploy "con cuenta Google" en vez de "Cualquier persona" | Hacé una NUEVA implementación con acceso = "Cualquier persona" |
| La app no muestra los botones nuevos | Caché viejo del browser | Cmd+Shift+R para hard refresh |
| El modal Importar dice "Configurá primero la URL" | Falta URL del Apps Script en Configuración | Paso D |

---

## 📞 Si algo no anda

Volvé al chat y avisame **qué hiciste hasta dónde** y **qué error exacto te apareció**.
Si es un error del Apps Script, abrí el editor → **Ejecuciones** (en la columna izquierda) → te muestra los logs de los últimos requests.

---

*Documento generado para v3.4 del 21/05/2026.*
