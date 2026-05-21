// ============================================================
// THE BUTCHER — APPS SCRIPT: PEGAR DE UNA
//
// Este archivo junta TODO lo nuevo del frontend v3.4 en un solo lugar.
// Te ahorra abrir 2 archivos separados.
//
// ⚠️ ESTE ARCHIVO NO REEMPLAZA TU APPS SCRIPT ACTUAL.
//    Solo SUMA cosas al final + 4 líneas al doPost.
//
// ============================================================
// PASO 1 — ABRIR EL APPS SCRIPT
// ============================================================
//   1. Abrí el Sheet "[The Butcher] Sales" en Google Drive.
//   2. Menú: Extensiones → Apps Script.
//   3. Se abre el editor con tu código actual (v4).
//
// ============================================================
// PASO 2 — AGREGAR 4 LÍNEAS DENTRO DE doPost()
// ============================================================
//   Buscá tu función doPost(). Adentro hay un bloque tipo:
//
//     if (action === 'guardarPedido') {
//       result = guardarPedido(data);
//     } else if (action === 'actualizarPago') {
//       result = actualizarPago(data);
//     } else if (action === 'generarReporteMensual') {
//       ...
//     }
//
//   Sumá ANTES del else final (o del cierre del if/else) estas 4 líneas:
//
//     } else if (action === 'editarPedido') {
//       result = editarPedido(data);
//     } else if (action === 'extraerPedido') {
//       result = extraerPedido(data);
//
// ============================================================
// PASO 3 — PEGAR TODO ESTE CÓDIGO AL FINAL DEL ARCHIVO
// ============================================================
//   Bajá hasta el final del archivo (después de la última función)
//   y pegá TODO lo que viene de acá para abajo.
//
// ============================================================
// PASO 4 — SETEAR LA API KEY DE GEMINI (solo si querés OCR)
// ============================================================
//   Si NO vas a usar la lectura de fotos/texto, salteá este paso.
//
//   a. Conseguí una API key GRATIS en:
//      https://aistudio.google.com/apikey
//      (Click "Create API key" → copia)
//
//   b. En el Apps Script, ir a:
//      ⚙️ Configuración del proyecto (icono engranaje, columna izquierda)
//      → Sección "Propiedades del secuencia de comandos"
//      → "Agregar propiedad de secuencia de comandos"
//      Nombre:  GEMINI_API_KEY
//      Valor:   (la API key que copiaste)
//      → Guardar
//
// ============================================================
// PASO 5 — IMPLEMENTAR
// ============================================================
//   1. Guardar (Ctrl+S o Cmd+S).
//   2. Botón "Implementar" (arriba a la derecha).
//   3. "Nueva implementación" (NO "Administrar implementaciones").
//   4. Tipo: "Aplicación web".
//   5. Ejecutar como: Yo (tu cuenta).
//   6. Quién tiene acceso: Cualquier persona.
//   7. "Implementar".
//   8. Copiá la URL nueva que termina en /exec.
//
// ============================================================
// PASO 6 — PEGAR LA URL EN LA APP
// ============================================================
//   1. Abrí la app: https://lafondiatta-hub.github.io/butcher-pedidos/
//   2. Menú ⚙️ Configuración.
//   3. Pegá la URL nueva en "URL Google Sheets (Apps Script)".
//   4. Guardar.
//
// LISTO. La app ya puede:
//   - ✏️ Editar pedidos existentes (lo del handoff)
//   - 📷 Cargar pedido desde foto/texto con IA (si setea-ste GEMINI_API_KEY)
//
// LÍMITES Gemini Flash free tier:
//   - 15 requests/minuto · 1.500 requests/día · más que suficiente.
//
// ============================================================


// ============================================================
// FUNCIÓN 1: editarPedido
// ============================================================
// Busca la fila por (clienteOriginal + fechaOriginal) y reescribe
// las 19 columnas con los datos nuevos del pedido.
//
// data esperado desde la app:
// {
//   action: 'editarPedido',
//   clienteOriginal: 'Nombre viejo',
//   fechaOriginal: '2026-05-21',
//   pedido: { ...mismo shape que guardarPedido... }
// }
// ============================================================
function editarPedido(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_SALES);

  if (!hoja) {
    return { success: false, error: 'No se encontró la pestaña "' + HOJA_SALES + '"' };
  }

  var pedido = data.pedido;
  if (!pedido) {
    return { success: false, error: 'Falta el objeto pedido' };
  }

  var clienteOrig = (data.clienteOriginal || pedido.cliente || '').toString().trim().toLowerCase();
  var fechaOrig = (data.fechaOriginal || pedido.fecha || '').toString().trim();

  if (!clienteOrig) {
    return { success: false, error: 'Falta el cliente original para ubicar el pedido' };
  }

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) {
    return { success: false, error: 'La hoja Sales está vacía' };
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, 19).getValues();

  // Buscar la fila por cliente + fecha (de atrás para adelante = más reciente primero)
  var filaEncontrada = -1;
  var numPedidoExistente = 0;
  for (var i = datos.length - 1; i >= 0; i--) {
    var clienteFila = (datos[i][5] || '').toString().trim().toLowerCase(); // col F
    if (clienteFila !== clienteOrig) continue;

    if (fechaOrig) {
      var fechaFilaStr = normalizarFechaParaButcher(datos[i][2]); // col C
      if (fechaFilaStr === fechaOrig) {
        filaEncontrada = i + 2;
        numPedidoExistente = parseInt(datos[i][0]) || 0; // conservar N° original (col A)
        break;
      }
    } else {
      filaEncontrada = i + 2;
      numPedidoExistente = parseInt(datos[i][0]) || 0;
      break;
    }
  }

  if (filaEncontrada === -1) {
    return {
      success: false,
      error: 'No se encontró el pedido de "' + (data.clienteOriginal || pedido.cliente) +
             '" para editar. Puede haberse guardado con otro nombre o fecha.'
    };
  }

  // Reconstruir la fila con los MISMOS criterios que guardarPedido()
  var fechaPedido = new Date(pedido.fecha);
  var mesVenta = new Date(fechaPedido.getFullYear(), fechaPedido.getMonth(), 1);
  var fechaEntrega = pedido.fechaEntrega ? new Date(pedido.fechaEntrega) : fechaPedido;

  var tipoEnvio;
  if (pedido.tipoEnvio) {
    tipoEnvio = pedido.tipoEnvio === 'delivery' ? 'Delivery' : 'Retira';
  } else {
    tipoEnvio = (pedido.direccion && pedido.direccion.trim() !== '') ? 'Delivery' : 'Retira';
  }

  var confirmPago = pedido.estado === 'pagado' ? 'Pagado'
                  : pedido.estado === 'parcial' ? 'Parcial'
                  : 'Pendiente';
  var modalidadPago = pedido.metodoPago || '';

  var comentario = '';
  if (pedido.items && pedido.items.length > 0) {
    comentario = pedido.items.map(function(item) {
      if (item.tipo === 'kg') {
        return item.producto + ' (' + Number(item.pesoOCantidad).toFixed(3) + 'kg)';
      } else {
        return item.producto + ' (' + item.pesoOCantidad + 'u)';
      }
    }).join(', ');
  }
  if (pedido.tipoEnvio === 'delivery' && pedido.horario) {
    comentario = comentario + (comentario ? ' | ' : '') + '⏰ ' + pedido.horario;
  }
  if (pedido.notasCobro) {
    comentario = comentario + (comentario ? ' | ' : '') + pedido.notasCobro;
  }

  var fila = [
    numPedidoExistente,                       // A - conservar N° original
    mesVenta,                                 // B
    fechaPedido,                              // C
    fechaEntrega,                             // D
    pedido.vendedor || 'App',                 // E
    pedido.cliente || '',                     // F
    pedido.telefono || '',                    // G
    pedido.direccion || '',                   // H
    tipoEnvio,                                // I
    '',                                       // J (precio envío)
    pedido.subtotalPedido || 0,               // K
    pedido.descuentoMonto || 0,               // L
    '',                                       // M (comisiones)
    pedido.totalFinal || 0,                   // N
    modalidadPago,                            // O
    '',                                       // P
    confirmPago,                              // Q
    '',                                       // R
    comentario                                // S
  ];

  hoja.getRange(filaEncontrada, 1, 1, 19).setValues([fila]);
  hoja.getRange(filaEncontrada, 2).setNumberFormat('dd/MM/yyyy');
  hoja.getRange(filaEncontrada, 3).setNumberFormat('dd/MM/yyyy');
  hoja.getRange(filaEncontrada, 4).setNumberFormat('dd/MM/yyyy');

  return {
    success: true,
    fila: filaEncontrada,
    numPedido: numPedidoExistente,
    message: 'Pedido editado: ' + pedido.cliente + ' (fila ' + filaEncontrada + ')'
  };
}


// ============================================================
// HELPER: normalizar fecha a 'YYYY-MM-DD'
// (renombrado para no chocar con otras funciones tuyas)
// ============================================================
function normalizarFechaParaButcher(valor) {
  if (!valor) return '';
  if (typeof valor === 'object' && typeof valor.getFullYear === 'function') {
    var y = valor.getFullYear();
    var m = String(valor.getMonth() + 1).padStart(2, '0');
    var d = String(valor.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  if (typeof valor === 'string') {
    var partes = valor.split('/');
    if (partes.length === 3) {
      var anio = partes[2].length === 2 ? '20' + partes[2] : partes[2];
      return anio + '-' + partes[1].padStart(2, '0') + '-' + partes[0].padStart(2, '0');
    }
    return valor;
  }
  return '';
}


// ============================================================
// FUNCIÓN 2: extraerPedido (OCR con Gemini)
// ============================================================
function extraerPedido(data) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return {
      success: false,
      error: 'Falta GEMINI_API_KEY en Propiedades del script. Ver Paso 4 del header.'
    };
  }

  if (!data.texto && !data.imagenBase64) {
    return { success: false, error: 'Falta texto o imagen' };
  }

  var catalogoStr = (data.catalogo && data.catalogo.length)
    ? data.catalogo.join(', ')
    : '(catálogo no provisto)';

  var prompt = 'Extraé los datos de un pedido de carnicería de Argentina (estilo carnicería barrial: pedidos por WhatsApp, mensajes, papel).\n\n' +
    'Catálogo de productos disponibles (usá estos nombres EXACTOS cuando coincidan):\n' + catalogoStr + '\n\n' +
    'Devolvé EXCLUSIVAMENTE un JSON válido con este shape (campos opcionales si no se mencionan — omitilos):\n' +
    '{\n' +
    '  "cliente": "Nombre y apellido",\n' +
    '  "telefono": "11 1234-5678",\n' +
    '  "direccion": "Calle 123, Barrio",\n' +
    '  "fecha": "YYYY-MM-DD",\n' +
    '  "fechaEntrega": "YYYY-MM-DD",\n' +
    '  "vendedor": "JP" | "Camba" | "Chino" | "Ficha" | "Toto" | "Agus Camba" | "Mariana" | "TDN",\n' +
    '  "tipoEnvio": "delivery" | "retiro",\n' +
    '  "horario": "11 a 14 hs" | "13 a 17 hs" | "16 a 20 hs" | "Todo el día" | "<texto libre>",\n' +
    '  "items": [\n' +
    '    {\n' +
    '      "producto": "Nombre del producto (mejor si coincide con catálogo)",\n' +
    '      "tipo": "kg" | "unidad",\n' +
    '      "cantidad": 1.5,\n' +
    '      "precio": 0\n' +
    '    }\n' +
    '  ],\n' +
    '  "notas": "cualquier dato útil que no entre en otros campos"\n' +
    '}\n\n' +
    'REGLAS:\n' +
    '- Español rioplatense (BsAs). "asado", "vacío", "matambre", "chorizos", "morcilla", "milanesas", "pollo", "cerdo" son comunes.\n' +
    '- Si el item viene en kg sin número (ej "asado"), poné cantidad: 0 y tipo: "kg".\n' +
    '- Si viene en unidades (ej "6 chorizos"), poné cantidad: 6 y tipo: "unidad".\n' +
    '- "media docena" = 6 unidades, "una docena" = 12 unidades.\n' +
    '- "1/2 kg" = 0.5 kg, "1 1/4 kg" = 1.25 kg, "kilo y medio" = 1.5 kg.\n' +
    '- Si NO se menciona un campo, NO lo inventes — omitilo.\n' +
    '- Respondé SOLO con el JSON. Sin texto antes, sin texto después, sin ```json.\n\n' +
    (data.texto ? 'TEXTO DEL PEDIDO:\n' + data.texto : 'El pedido viene en la imagen adjunta.');

  var parts = [{ text: prompt }];
  if (data.imagenBase64) {
    var match = String(data.imagenBase64).match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (match) {
      parts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2]
        }
      });
    }
  }

  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  var body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  try {
    var resp = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var text = resp.getContentText();
    if (code < 200 || code >= 300) {
      return { success: false, error: 'Gemini HTTP ' + code + ': ' + text.slice(0, 300) };
    }
    var parsed = JSON.parse(text);
    var rawJson = parsed && parsed.candidates && parsed.candidates[0] &&
                  parsed.candidates[0].content && parsed.candidates[0].content.parts &&
                  parsed.candidates[0].content.parts[0] && parsed.candidates[0].content.parts[0].text;
    if (!rawJson) {
      return { success: false, error: 'Respuesta sin contenido. Raw: ' + text.slice(0, 300) };
    }
    var datos;
    try { datos = JSON.parse(rawJson); }
    catch(e) {
      var clean = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      try { datos = JSON.parse(clean); }
      catch(e2) { return { success: false, error: 'JSON inválido de Gemini: ' + rawJson.slice(0, 300) }; }
    }
    return { success: true, datos: datos };
  } catch(err) {
    return { success: false, error: 'Excepción: ' + err.message };
  }
}
