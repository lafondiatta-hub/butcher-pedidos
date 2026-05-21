// ============================================================
// THE BUTCHER — Google Apps Script v5
//
// NOVEDADES v5 (sobre v4):
//   - 'editarPedido'   → reescribe una fila existente en Sales
//                        ubicándola por (clienteOriginal + fechaOriginal)
//   - 'extraerPedido'  → OCR / extracción IA con Gemini 2.0 Flash
//                        a partir de imagen base64 o texto pegado
//   - Bug fix: var filasTotal = 0 declarado (en v4 fallaba "filasTotal is not defined")
//
// CÓMO ACTUALIZAR (NUEVO desde v4):
// 1. Abrí "[The Butcher] Sales" → Extensiones → Apps Script
// 2. Seleccioná todo el código actual y BORRALO
// 3. Pegá este archivo entero
// 4. (Solo si vas a usar OCR) Configurá GEMINI_API_KEY:
//    ⚙️ Configuración del proyecto → Propiedades del secuencia de comandos
//    → Agregar:  Nombre: GEMINI_API_KEY  Valor: <key de https://aistudio.google.com/apikey>
// 5. Guardar (Cmd+S)
// 6. Implementar → Nueva implementación
//    - Tipo: App web
//    - Ejecutar como: Yo
//    - Acceso: Cualquier persona
// 7. Si te pide permisos nuevos (UrlFetch), aprobalos.
// 8. Copiá la URL nueva /exec y pegala en la app (⚙️ Configuración)
// ============================================================

var HOJA_SALES = 'Sales';
var HOJA_DETALLE = 'Detalle pedido';

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'guardarPedido';
    var result;

    if (action === 'guardarPedido') {
      result = guardarPedido(data.pedido);
    } else if (action === 'actualizarPago') {
      result = actualizarPago(data);
    } else if (action === 'editarPedido') {           // v5
      result = editarPedido(data);
    } else if (action === 'extraerPedido') {          // v5
      result = extraerPedido(data);
    } else if (action === 'generarReporteMensual') {
      result = generarReporteMensual(data.mes, data.anio);
    } else {
      result = { success: false, error: 'Accion no reconocida: ' + action };
    }

    lock.releaseLock();
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';

  if (action === 'ping') {
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'The Butcher API v5 activa' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'generarReporteMensual') {
    var mes = parseInt(e.parameter.mes);
    var anio = parseInt(e.parameter.anio);
    var result = generarReporteMensual(mes, anio);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// ACTUALIZAR PAGO (sin cambios respecto a v4)
// ============================================================
function actualizarPago(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_SALES);

  if (!hoja) {
    return { success: false, error: 'No se encontró la pestaña "' + HOJA_SALES + '"' };
  }

  var cliente = (data.cliente || '').toString().trim().toLowerCase();
  var fechaBuscada = (data.fecha || '').toString().trim();
  var nuevoEstado = data.estado || 'Pagado';
  var metodoPago = data.metodoPago || '';
  var fechaPago = data.fechaPago || '';

  if (!cliente) {
    return { success: false, error: 'Falta el nombre del cliente' };
  }

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) {
    return { success: false, error: 'La hoja Sales está vacía' };
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, 19).getValues();

  var filaEncontrada = -1;
  var mejorMatch = -1;

  for (var i = datos.length - 1; i >= 0; i--) {
    var clienteFila = (datos[i][5] || '').toString().trim().toLowerCase();
    if (clienteFila !== cliente) continue;

    if (fechaBuscada) {
      var fechaFila = datos[i][2];
      var fechaFilaStr = '';

      if (fechaFila && typeof fechaFila === 'object' && typeof fechaFila.getFullYear === 'function') {
        var y = fechaFila.getFullYear();
        var m = String(fechaFila.getMonth() + 1).padStart(2, '0');
        var d = String(fechaFila.getDate()).padStart(2, '0');
        fechaFilaStr = y + '-' + m + '-' + d;
      } else if (typeof fechaFila === 'string') {
        var partes = fechaFila.split('/');
        if (partes.length === 3) {
          var anio = partes[2].length === 2 ? '20' + partes[2] : partes[2];
          fechaFilaStr = anio + '-' + partes[1].padStart(2,'0') + '-' + partes[0].padStart(2,'0');
        } else {
          fechaFilaStr = fechaFila;
        }
      }

      if (fechaFilaStr === fechaBuscada) {
        filaEncontrada = i + 2;
        break;
      }
    } else {
      if (mejorMatch === -1) mejorMatch = i + 2;
    }
  }

  if (filaEncontrada === -1 && mejorMatch !== -1) {
    filaEncontrada = mejorMatch;
  }

  if (filaEncontrada === -1) {
    return {
      success: false,
      error: 'No se encontró el pedido de "' + data.cliente + '" en Sales.' +
             ' El pedido puede haberse guardado con otro nombre o fecha.'
    };
  }

  hoja.getRange(filaEncontrada, 17).setValue(nuevoEstado);
  if (metodoPago) hoja.getRange(filaEncontrada, 15).setValue(metodoPago);
  if (fechaPago) hoja.getRange(filaEncontrada, 16).setValue(fechaPago);

  return {
    success: true,
    message: 'Pago actualizado: ' + data.cliente + ' → ' + nuevoEstado + ' (fila ' + filaEncontrada + ')',
    fila: filaEncontrada
  };
}


// ============================================================
// GUARDAR PEDIDO (sin cambios respecto a v4)
// ============================================================
function guardarPedido(pedido) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_SALES);

  if (!hoja) {
    return { success: false, error: 'No se encontro la pestaña "' + HOJA_SALES + '".' };
  }

  var ultimaFilaSheet = hoja.getLastRow();
  var filaDestino = 2;
  var numPedido = 0;

  if (ultimaFilaSheet > 1) {
    var datosA = hoja.getRange(2, 1, ultimaFilaSheet - 1, 1).getValues();
    var datosF = hoja.getRange(2, 6, ultimaFilaSheet - 1, 1).getValues();

    for (var i = datosF.length - 1; i >= 0; i--) {
      var clienteRow = datosF[i][0];
      if (clienteRow && clienteRow.toString().trim() !== '') {
        filaDestino = i + 2 + 1;
        numPedido = parseInt(datosA[i][0]) || 0;
        break;
      }
    }
  }

  numPedido = numPedido + 1;

  var fechaPedido = new Date(pedido.fecha);
  var mesVenta = new Date(fechaPedido.getFullYear(), fechaPedido.getMonth(), 1);
  var fechaEntrega = pedido.fechaEntrega ? new Date(pedido.fechaEntrega) : fechaPedido;

  var tipoEnvio;
  if (pedido.tipoEnvio) {
    tipoEnvio = pedido.tipoEnvio === 'delivery' ? 'Delivery' : 'Retira';
  } else {
    tipoEnvio = (pedido.direccion && pedido.direccion.trim() !== '') ? 'Delivery' : 'Retira';
  }

  var confirmPago = pedido.estado === 'pagado' ? 'Pagado' : 'Pendiente';
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
    numPedido, mesVenta, fechaPedido, fechaEntrega,
    pedido.vendedor || 'App', pedido.cliente || '',
    pedido.telefono || '', pedido.direccion || '',
    tipoEnvio, '',
    pedido.subtotalPedido || 0, pedido.descuentoMonto || 0,
    '', pedido.totalFinal || 0,
    modalidadPago, '', confirmPago, '', comentario
  ];

  hoja.getRange(filaDestino, 1, 1, 19).setValues([fila]);
  hoja.getRange(filaDestino, 2).setNumberFormat('dd/MM/yyyy');
  hoja.getRange(filaDestino, 3).setNumberFormat('dd/MM/yyyy');
  hoja.getRange(filaDestino, 4).setNumberFormat('dd/MM/yyyy');

  return {
    success: true,
    numPedido: numPedido,
    fila: filaDestino,
    message: 'Pedido #' + numPedido + ' guardado en Sales (fila ' + filaDestino + ')'
  };
}


// ============================================================
// EDITAR PEDIDO (v5)
// Busca la fila por (clienteOriginal + fechaOriginal) y reescribe
// las 19 columnas con los datos nuevos del pedido.
// Conserva el N° de pedido original (columna A).
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

  var filaEncontrada = -1;
  var numPedidoExistente = 0;
  for (var i = datos.length - 1; i >= 0; i--) {
    var clienteFila = (datos[i][5] || '').toString().trim().toLowerCase();
    if (clienteFila !== clienteOrig) continue;

    if (fechaOrig) {
      var fechaFilaStr = normalizarFechaParaButcher(datos[i][2]);
      if (fechaFilaStr === fechaOrig) {
        filaEncontrada = i + 2;
        numPedidoExistente = parseInt(datos[i][0]) || 0;
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
    numPedidoExistente,
    mesVenta,
    fechaPedido,
    fechaEntrega,
    pedido.vendedor || 'App',
    pedido.cliente || '',
    pedido.telefono || '',
    pedido.direccion || '',
    tipoEnvio,
    '',
    pedido.subtotalPedido || 0,
    pedido.descuentoMonto || 0,
    '',
    pedido.totalFinal || 0,
    modalidadPago,
    '',
    confirmPago,
    '',
    comentario
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

// Helper auxiliar de editarPedido — devuelve 'YYYY-MM-DD' desde un valor de celda
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
// EXTRAER PEDIDO (v5) — OCR / extracción con Gemini 2.0 Flash
// Requiere setear GEMINI_API_KEY en Propiedades del script.
// ============================================================
function extraerPedido(data) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return {
      success: false,
      error: 'Falta GEMINI_API_KEY en Propiedades del script. Conseguila en https://aistudio.google.com/apikey y pegala en ⚙️ Configuración del proyecto → Propiedades del secuencia de comandos.'
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


// ============================================================
// GENERAR REPORTE MENSUAL (v5 — bug fix: filasTotal declarado)
// ============================================================
function generarReporteMensual(mes, anio) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_SALES);

  if (!hoja) {
    return { success: false, error: 'No se encontro la pestaña Sales' };
  }

  var nombresMes = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  var detallePorPedido = {};
  var hojaDetalle = ss.getSheetByName(HOJA_DETALLE);
  var headerDetalle = [];

  if (hojaDetalle) {
    var datosDetalle = hojaDetalle.getDataRange().getValues();
    if (datosDetalle.length > 2) {
      headerDetalle = datosDetalle[1];
      for (var d = 2; d < datosDetalle.length; d++) {
        var numPed = datosDetalle[d][0];
        if (!numPed) continue;
        numPed = parseInt(numPed);
        var items = [];
        for (var col = 4; col < headerDetalle.length; col++) {
          var val = datosDetalle[d][col];
          if (val && val !== 0 && val !== '' && val !== null) {
            var nombreProd = headerDetalle[col];
            if (!nombreProd) continue;
            nombreProd = nombreProd.toString().trim();
            var cantidad = parseFloat(val);
            if (isNaN(cantidad) || cantidad === 0) continue;
            var esUnidad = esProductoUnidad(nombreProd);
            items.push({ producto: nombreProd, cantidad: cantidad, tipo: esUnidad ? 'u' : 'kg' });
          }
        }
        if (items.length > 0) detallePorPedido[numPed] = items;
      }
    }
  }

  var datos = hoja.getDataRange().getValues();
  var consumos = {};
  var pedidosProcesados = 0;
  var filasConCliente = 0;
  var filasDelMes = 0;
  var filasTotal = 0;            // BUG FIX v5: estaba sin declarar
  var debugFechas = [];

  for (var i = 1; i < datos.length; i++) {
    var numPedido = datos[i][0];
    var mesVenta = datos[i][1];
    var fecha = datos[i][2];
    var comentario = datos[i][18];
    var clienteFila = datos[i][5];
    if (!clienteFila || clienteFila.toString().trim() === '') continue;
    filasConCliente++;

    var fechaMes = null, fechaAnio = null;
    if (fecha && typeof fecha === 'object' && typeof fecha.getMonth === 'function') {
      fechaMes = fecha.getMonth() + 1; fechaAnio = fecha.getFullYear();
    } else if (fecha && typeof fecha === 'string') {
      var parsed = parsearFechaTexto(fecha);
      if (parsed) { fechaMes = parsed.mes; fechaAnio = parsed.anio; }
    } else if (fecha && typeof fecha === 'number') {
      var dDate = new Date((fecha - 25569) * 86400 * 1000);
      if (!isNaN(dDate.getTime())) { fechaMes = dDate.getMonth() + 1; fechaAnio = dDate.getFullYear(); }
    }
    if (fechaMes === null && mesVenta) {
      if (mesVenta && typeof mesVenta === 'object' && typeof mesVenta.getMonth === 'function') {
        fechaMes = mesVenta.getMonth() + 1; fechaAnio = mesVenta.getFullYear();
      } else if (typeof mesVenta === 'string') {
        var parsed2 = parsearFechaTexto(mesVenta);
        if (parsed2) { fechaMes = parsed2.mes; fechaAnio = parsed2.anio; }
      } else if (typeof mesVenta === 'number') {
        var d2 = new Date((mesVenta - 25569) * 86400 * 1000);
        if (!isNaN(d2.getTime())) { fechaMes = d2.getMonth() + 1; fechaAnio = d2.getFullYear(); }
      }
    }
    if (fechaMes === null && debugFechas.length < 3) {
      debugFechas.push('Fila ' + (i+1) + ': ColC=' + String(fecha) + ' (' + typeof fecha + ')');
    }
    filasTotal++;
    if (fechaMes !== mes || fechaAnio !== anio) continue;
    filasDelMes++;

    var itemsEncontrados = false;
    if (comentario && typeof comentario === 'string' && comentario.trim() !== '') {
      var parteItems = comentario.split(' | ')[0];
      var itemsArr = parteItems.split(',');
      for (var j = 0; j < itemsArr.length; j++) {
        var item = itemsArr[j].trim();
        if (!item) continue;
        var match2 = item.match(/^(.+?)\s*\(([0-9.]+)(kg|u)\)$/);
        if (match2) {
          agregarConsumo(consumos, match2[1].trim(), parseFloat(match2[2]), match2[3]);
          itemsEncontrados = true;
        }
      }
    }
    if (!itemsEncontrados && numPedido) {
      var numPedInt = parseInt(numPedido);
      if (detallePorPedido[numPedInt]) {
        var itemsDet = detallePorPedido[numPedInt];
        for (var k = 0; k < itemsDet.length; k++) {
          agregarConsumo(consumos, itemsDet[k].producto, itemsDet[k].cantidad, itemsDet[k].tipo);
          itemsEncontrados = true;
        }
      }
    }
    if (itemsEncontrados) pedidosProcesados++;
  }

  var productos = [];
  var keys = Object.keys(consumos);
  for (var p = 0; p < keys.length; p++) productos.push(consumos[keys[p]]);
  productos.sort(function(a, b) { return b.pedidos - a.pedidos; });

  if (productos.length === 0) {
    var debugMsg = 'No hay datos para ' + nombresMes[mes-1] + ' ' + anio + '. ';
    debugMsg += 'Filas con cliente: ' + filasConCliente + ', del mes: ' + filasDelMes;
    return { success: false, error: debugMsg };
  }

  var nombreTab = 'Consumo ' + nombresMes[mes-1] + ' ' + anio;
  var hojaReporte = ss.getSheetByName(nombreTab);
  if (hojaReporte) hojaReporte.clear();
  else hojaReporte = ss.insertSheet(nombreTab);

  hojaReporte.getRange(1, 1).setValue('REPORTE DE CONSUMOS - ' + nombresMes[mes-1].toUpperCase() + ' ' + anio);
  hojaReporte.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  hojaReporte.getRange(1, 1, 1, 5).merge();
  hojaReporte.getRange(2, 1).setValue('Generado: ' + new Date().toLocaleDateString('es-AR') + ' | Pedidos: ' + pedidosProcesados);
  hojaReporte.getRange(4, 1, 1, 5).setValues([['Producto', 'Cant. Pedidos', 'Unidades', 'Kilos', 'Tipo']]);
  hojaReporte.getRange(4, 1, 1, 5).setFontWeight('bold').setBackground('#1a2542').setFontColor('white');

  var filas = [];
  for (var r = 0; r < productos.length; r++) {
    var prod = productos[r];
    filas.push([prod.producto, prod.pedidos, prod.unidades > 0 ? prod.unidades : '-', prod.kilos > 0 ? Math.round(prod.kilos * 1000) / 1000 : '-', prod.tipo === 'kg' ? 'Por kg' : 'Por unidad']);
  }
  hojaReporte.getRange(5, 1, filas.length, 5).setValues(filas);
  var filaTot = filas.length + 5;
  hojaReporte.getRange(filaTot, 1).setValue('TOTAL');
  hojaReporte.getRange(filaTot, 2).setFormula('=SUM(B5:B' + (filaTot - 1) + ')');
  hojaReporte.getRange(filaTot, 1, 1, 5).setFontWeight('bold').setBackground('#f0f0f0');
  hojaReporte.autoResizeColumns(1, 5);

  return {
    success: true,
    message: 'Reporte de ' + nombresMes[mes-1] + ' ' + anio + ' generado con ' + productos.length + ' productos (' + pedidosProcesados + ' pedidos)',
    tab: nombreTab
  };
}


// ============================================================
// HELPERS (sin cambios respecto a v4)
// ============================================================
function parsearFechaTexto(texto) {
  if (!texto) return null;
  texto = texto.toString().trim();
  var match1 = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match1) return { mes: parseInt(match1[2]), anio: parseInt(match1[3]) };
  var match2 = texto.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (match2) return { mes: parseInt(match2[2]), anio: parseInt(match2[1]) };
  return null;
}

function agregarConsumo(consumos, producto, cantidad, tipo) {
  if (!consumos[producto]) {
    consumos[producto] = { producto: producto, tipo: tipo, unidades: 0, kilos: 0, pedidos: 0 };
  }
  consumos[producto].pedidos += 1;
  if (tipo === 'kg') consumos[producto].kilos += cantidad;
  else consumos[producto].unidades += cantidad;
}

function esProductoUnidad(nombre) {
  var unidadPatterns = ['Provoleta', 'Carbon ', 'Carbón ', 'Pack Maderitas', 'Quebracho',
    'Postre', 'Franuis', 'Catena', 'Luigi Bosca',
    'Cerveza', 'Imperial', 'Heineken', 'Porron', 'Coca Cola', 'Fernet',
    'Chutney', 'Chimichurri', 'Salsa Criolla'];
  for (var i = 0; i < unidadPatterns.length; i++) {
    if (nombre.indexOf(unidadPatterns[i]) !== -1) return true;
  }
  return false;
}

function generarReporteAutomatico() {
  var ahora = new Date();
  var mes = ahora.getMonth();
  var anio = ahora.getFullYear();
  if (mes === 0) { mes = 12; anio--; }
  generarReporteMensual(mes, anio);
}
