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
// ID del Sheet ACTIVO ("[The Butcher] Sales 2026"). El script v5 ya no usa
// getActiveSpreadsheet() porque está bound al sheet VIEJO. Apunta acá.
var SPREADSHEET_ID = '1sW7PVDAMaJQ56MoMEQXW-r4gLP-OT8Ka_mbcx3rHpX8';

function getButcherSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

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
    } else if (action === 'sincronizarCobros') {      // v5.2 (reconciliación masiva)
      result = sincronizarCobros(data);
    } else if (action === 'editarPedido') {           // v5
      result = editarPedido(data);
    } else if (action === 'extraerPedido') {          // v5
      result = extraerPedido(data);
    } else if (action === 'crearEventoCalendar') {    // v5.1
      result = crearEventoCalendar(data);
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

  if (action === 'getReporteData') {
    var ss = getButcherSpreadsheet();
    var hoja = ss.getSheetByName(HOJA_SALES);
    if (!hoja) return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'No existe la hoja ' + HOJA_SALES }))
      .setMimeType(ContentService.MimeType.JSON);
    var ult = hoja.getLastRow();
    if (ult < 2) return ContentService
      .createTextOutput(JSON.stringify({ success: true, pedidos: [] }))
      .setMimeType(ContentService.MimeType.JSON);
    var datos = hoja.getRange(2, 1, ult - 1, 19).getValues();
    var out = [];
    for (var i = 0; i < datos.length; i++) {
      var row = datos[i];
      var cliente = (row[5] || '').toString().trim();
      if (!cliente) continue;
      out.push({
        sheetNum: parseInt(row[0]) || null,
        sheetRow: i + 2,
        fecha: normalizarFechaParaButcher(row[2]),
        fechaEntrega: normalizarFechaParaButcher(row[3]),
        vendedor: (row[4] || '').toString(),
        cliente: cliente,
        tipoEnvio: (row[8] || '').toString(),
        totalFinal: parseFloat(row[13]) || 0,
        metodoPago: (row[14] || '').toString(),
        fechaPago: normalizarFechaParaButcher(row[15]),
        estado: (row[16] || '').toString().trim() || 'Pendiente',
        itemsTexto: (row[18] || '').toString()
      });
    }
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, total: out.length, pedidos: out }))
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
  var ss = getButcherSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_SALES);

  if (!hoja) {
    return { success: false, error: 'No se encontró la pestaña "' + HOJA_SALES + '"' };
  }

  var cliente = (data.cliente || '').toString().trim().toLowerCase();
  var fechaBuscada = (data.fecha || '').toString().trim();
  var nuevoEstado = data.estado || 'Pagado';
  var metodoPago = data.metodoPago || '';
  var fechaPago = data.fechaPago || '';
  var sheetNumBuscado = parseInt(data.sheetNum) || 0;

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) {
    return { success: false, error: 'La hoja Sales está vacía' };
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, 19).getValues();

  var filaEncontrada = -1;
  var mejorMatch = -1;

  // 🎯 PRIORIDAD 1: buscar por N° (col A) si viene
  if (sheetNumBuscado > 0) {
    for (var k = 0; k < datos.length; k++) {
      if ((parseInt(datos[k][0]) || 0) === sheetNumBuscado) {
        filaEncontrada = k + 2;
        break;
      }
    }
  }

  // Si no se encontró por N° (o no vino sheetNum), fallback: cliente + fecha
  if (filaEncontrada === -1 && !cliente) {
    return { success: false, error: 'Falta sheetNum o cliente para ubicar el pedido' };
  }

  if (filaEncontrada === -1) for (var i = datos.length - 1; i >= 0; i--) {
    var clienteFila = (datos[i][5] || '').toString().trim().toLowerCase();
    if (clienteFila !== cliente) continue;

    // Siempre trackear el más reciente del cliente como fallback,
    // así si la fecha no calza exacto igual se ubica la fila.
    if (mejorMatch === -1) mejorMatch = i + 2;

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
// FORMATO CONDICIONAL POR ESTADO DE PAGO (v5.2)
// Pinta la fila entera (A:S) según col Q ("Confirmación de pago").
// Idempotente: si las reglas ya están, no las duplica.
// ============================================================
function asegurarFormatoCondicional(hoja) {
  var marcadores = ['=$Q2="Pagado"', '=$Q2="Parcial"', '=$Q2="Pendiente"'];
  var reglas = hoja.getConditionalFormatRules().filter(function(r) {
    var bc = r.getBooleanCondition && r.getBooleanCondition();
    if (!bc) return true;
    var vals = bc.getCriteriaValues && bc.getCriteriaValues();
    return !vals || !vals.length || marcadores.indexOf(vals[0]) === -1;
  });

  var ultimaFila = Math.max(hoja.getMaxRows(), 1000);
  var rango = hoja.getRange('A2:S' + ultimaFila);

  reglas.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(marcadores[0])
      .setBackground('#d9ead3') // verde suave → Pagado
      .setRanges([rango]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(marcadores[1])
      .setBackground('#fff2cc') // amarillo suave → Parcial
      .setRanges([rango]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(marcadores[2])
      .setBackground('#f4cccc') // rojo suave → Pendiente
      .setRanges([rango]).build()
  );
  hoja.setConditionalFormatRules(reglas);
}


// ============================================================
// SINCRONIZAR COBROS (v5.2)
// Reconciliación masiva: recibe TODOS los pedidos cobrados de la app
// (pagado/parcial) y actualiza en Sales las filas que sigan pendientes.
// Match por sheetNum (col A) → fallback cliente+fecha.
// data.cobros = [{ sheetNum, cliente, fecha, estado, metodoPago, fechaPago }]
// ============================================================
function sincronizarCobros(data) {
  var ss = getButcherSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_SALES);
  if (!hoja) {
    return { success: false, error: 'No se encontró la pestaña "' + HOJA_SALES + '"' };
  }
  asegurarFormatoCondicional(hoja);

  var cobros = data.cobros || [];
  if (!cobros.length) {
    return { success: true, actualizados: 0, sinCambios: 0, noEncontrados: 0,
             detalleNoEncontrados: [], message: 'No hay cobros para sincronizar' };
  }

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) {
    return { success: false, error: 'La hoja Sales está vacía' };
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, 19).getValues();

  var actualizados = 0, sinCambios = 0, noEncontrados = 0;
  var detalleNoEncontrados = [];
  var usados = {};

  for (var c = 0; c < cobros.length; c++) {
    var cob = cobros[c] || {};
    var sheetNum = parseInt(cob.sheetNum) || 0;
    var cliente = (cob.cliente || '').toString().trim().toLowerCase();
    var fechaBuscada = (cob.fecha || '').toString().trim();
    var estado = cob.estado === 'parcial' ? 'Parcial' : 'Pagado';

    var idx = -1;

    // PRIORIDAD 1: match por N° (col A)
    if (sheetNum > 0) {
      for (var k = 0; k < datos.length; k++) {
        if (usados[k]) continue;
        if ((parseInt(datos[k][0]) || 0) === sheetNum) { idx = k; break; }
      }
    }

    // PRIORIDAD 2: fallback cliente + fecha exacta → cliente más reciente
    if (idx === -1 && cliente) {
      var mejor = -1;
      for (var j = datos.length - 1; j >= 0; j--) {
        if (usados[j]) continue;
        if ((datos[j][5] || '').toString().trim().toLowerCase() !== cliente) continue;
        if (fechaBuscada && normalizarFechaParaButcher(datos[j][2]) === fechaBuscada) { idx = j; break; }
        if (mejor === -1) mejor = j;
      }
      if (idx === -1) idx = mejor;
    }

    if (idx === -1) {
      noEncontrados++;
      detalleNoEncontrados.push(cob.cliente + (fechaBuscada ? (' (' + fechaBuscada + ')') : ''));
      continue;
    }
    usados[idx] = true;

    var fila = idx + 2;
    var cambio = false;
    if ((datos[idx][16] || '').toString().trim().toLowerCase() !== estado.toLowerCase()) {
      hoja.getRange(fila, 17).setValue(estado);
      cambio = true;
    }
    if (cob.metodoPago && (datos[idx][14] || '').toString().trim() !== cob.metodoPago) {
      hoja.getRange(fila, 15).setValue(cob.metodoPago);
      cambio = true;
    }
    if (cob.fechaPago && !(datos[idx][15] || '').toString().trim()) {
      hoja.getRange(fila, 16).setValue(cob.fechaPago);
      cambio = true;
    }
    if (cambio) actualizados++; else sinCambios++;
  }

  return {
    success: true,
    actualizados: actualizados,
    sinCambios: sinCambios,
    noEncontrados: noEncontrados,
    detalleNoEncontrados: detalleNoEncontrados,
    message: 'Sincronización: ' + actualizados + ' actualizados, ' +
             sinCambios + ' ya estaban al día, ' + noEncontrados + ' no encontrados'
  };
}


// ============================================================
// GUARDAR PEDIDO (sin cambios respecto a v4)
// ============================================================
function guardarPedido(pedido) {
  var ss = getButcherSpreadsheet();
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
      var nombre = item.producto;
      if (item.variante) nombre += ' [' + item.variante + ']';
      var base;
      if (item.tipo === 'kg') {
        base = nombre + ' (' + Number(item.pesoOCantidad).toFixed(3) + 'kg)';
      } else {
        base = nombre + ' (' + item.pesoOCantidad + 'u)';
      }
      if (item.estado === 'fresco') base += ' 🥩';
      else if (item.estado === 'congelado') base += ' ❄️';
      return base;
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
  asegurarFormatoCondicional(hoja);

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
  var ss = getButcherSpreadsheet();
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
  var sheetNumBuscado = parseInt(data.sheetNum) || 0;

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) {
    return { success: false, error: 'La hoja Sales está vacía' };
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, 19).getValues();

  var filaEncontrada = -1;
  var numPedidoExistente = 0;

  // 🎯 PRIORIDAD 1: buscar por N° (col A) si viene
  if (sheetNumBuscado > 0) {
    for (var k = 0; k < datos.length; k++) {
      if ((parseInt(datos[k][0]) || 0) === sheetNumBuscado) {
        filaEncontrada = k + 2;
        numPedidoExistente = sheetNumBuscado;
        break;
      }
    }
  }

  if (filaEncontrada === -1 && !clienteOrig) {
    return { success: false, error: 'Falta sheetNum o cliente original para ubicar el pedido' };
  }

  // PRIORIDAD 2 (fallback): cliente + fecha exacta → cliente más reciente
  var mejorFilaCliente = -1, mejorNumCliente = 0;
  if (filaEncontrada === -1) for (var i = datos.length - 1; i >= 0; i--) {
    var clienteFila = (datos[i][5] || '').toString().trim().toLowerCase();
    if (clienteFila !== clienteOrig) continue;

    if (mejorFilaCliente === -1) {
      mejorFilaCliente = i + 2;
      mejorNumCliente = parseInt(datos[i][0]) || 0;
    }

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

  if (filaEncontrada === -1 && mejorFilaCliente !== -1) {
    filaEncontrada = mejorFilaCliente;
    numPedidoExistente = mejorNumCliente;
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
      var nombre = item.producto;
      if (item.variante) nombre += ' [' + item.variante + ']';
      var base;
      if (item.tipo === 'kg') {
        base = nombre + ' (' + Number(item.pesoOCantidad).toFixed(3) + 'kg)';
      } else {
        base = nombre + ' (' + item.pesoOCantidad + 'u)';
      }
      if (item.estado === 'fresco') base += ' 🥩';
      else if (item.estado === 'congelado') base += ' ❄️';
      return base;
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
// CREAR EVENTO CALENDAR (v5.1)
// Crea el evento directamente en el calendar "Eventos La Fondiatta"
// (o el primero que matchee por nombre), con color Grafito.
// Cae al calendar default si no encuentra match.
//
// data esperado desde la app:
// {
//   action: 'crearEventoCalendar',
//   titulo: 'PEDIDO BUTCHER - ...',
//   descripcion: '...texto multilínea...',
//   fechaInicio: '2026-05-22T11:00:00' (ISO LOCAL sin Z),
//   fechaFin:    '2026-05-22T14:00:00',
//   allDay: false,
//   location: '...',
//   calendarName: 'Eventos La Fondiatta'  // nombre del calendar buscado
// }
// ============================================================
function crearEventoCalendar(data) {
  try {
    if (!data.titulo || !data.fechaInicio) {
      return { success: false, error: 'Falta titulo o fechaInicio' };
    }
    var calendarBuscado = (data.calendarName || 'Eventos La Fondiatta').toString().trim();

    // Buscar el calendar por nombre (case-insensitive)
    var cals = CalendarApp.getAllCalendars();
    var calendar = null;
    var nombreLower = calendarBuscado.toLowerCase();
    for (var i = 0; i < cals.length; i++) {
      if (cals[i].getName().toLowerCase() === nombreLower) {
        calendar = cals[i];
        break;
      }
    }
    // Fallback: match parcial
    if (!calendar) {
      for (var j = 0; j < cals.length; j++) {
        if (cals[j].getName().toLowerCase().indexOf(nombreLower) !== -1) {
          calendar = cals[j];
          break;
        }
      }
    }
    if (!calendar) {
      // No hay calendar con ese nombre — devolver error con lista para que Santi vea cuáles tiene accesibles
      var nombres = cals.map(function(c) { return c.getName(); }).slice(0, 20);
      return {
        success: false,
        error: 'No encontré calendar "' + calendarBuscado + '". Calendars accesibles: ' + nombres.join(', ')
      };
    }

    // Construir fechas — las ISO vienen en LOCAL (sin Z), las parseo asumiendo TZ del script
    var inicio = new Date(data.fechaInicio);
    var fin = data.fechaFin ? new Date(data.fechaFin) : new Date(inicio.getTime() + 60 * 60 * 1000);

    var evento;
    if (data.allDay) {
      // Para all-day, CalendarApp usa solo la fecha
      evento = calendar.createAllDayEvent(data.titulo, inicio, {
        description: data.descripcion || '',
        location: data.location || ''
      });
    } else {
      evento = calendar.createEvent(data.titulo, inicio, fin, {
        description: data.descripcion || '',
        location: data.location || ''
      });
    }

    // Color Grafito
    try { evento.setColor(CalendarApp.EventColor.GRAY); } catch(e) { /* algunos calendars no permiten color */ }

    var eventId = evento.getId();
    // Link al evento (genérico de Google Calendar)
    var calendarId = calendar.getId();
    var link = 'https://calendar.google.com/calendar/u/0/r/event?eid=' +
               Utilities.base64EncodeWebSafe(eventId.split('@')[0] + ' ' + calendarId).replace(/=+$/, '');

    return {
      success: true,
      eventId: eventId,
      eventLink: link,
      calendarName: calendar.getName(),
      message: 'Evento creado en ' + calendar.getName()
    };
  } catch(err) {
    return { success: false, error: 'Excepción: ' + err.message };
  }
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

  // Cadena de modelos a intentar en orden: si el primero da 503/429, prueba el siguiente
  var modelos = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
  var body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  var ultimoError = '';

  for (var mi = 0; mi < modelos.length; mi++) {
    var modelo = modelos[mi];
    var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + apiKey;

    // Retry con backoff por modelo: hasta 3 intentos
    for (var intento = 0; intento < 3; intento++) {
      if (intento > 0) Utilities.sleep(1500 * intento); // 1.5s, 3s

      try {
        var resp = UrlFetchApp.fetch(endpoint, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(body),
          muteHttpExceptions: true
        });
        var code = resp.getResponseCode();
        var text = resp.getContentText();

        // 503 (saturado) o 429 (cuota) → reintentar mismo modelo, después fallback
        if (code === 503 || code === 429) {
          ultimoError = 'HTTP ' + code + ' en ' + modelo;
          continue; // sigue al siguiente intento
        }
        if (code < 200 || code >= 300) {
          return { success: false, error: 'Gemini HTTP ' + code + ' (' + modelo + '): ' + text.slice(0, 300) };
        }

        var parsed = JSON.parse(text);
        var rawJson = parsed && parsed.candidates && parsed.candidates[0] &&
                      parsed.candidates[0].content && parsed.candidates[0].content.parts &&
                      parsed.candidates[0].content.parts[0] && parsed.candidates[0].content.parts[0].text;
        if (!rawJson) {
          ultimoError = 'Respuesta vacía de ' + modelo;
          continue;
        }
        var datos;
        try { datos = JSON.parse(rawJson); }
        catch(e) {
          var clean = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
          try { datos = JSON.parse(clean); }
          catch(e2) { return { success: false, error: 'JSON inválido de ' + modelo + ': ' + rawJson.slice(0, 300) }; }
        }
        return { success: true, datos: datos, modelo: modelo };
      } catch(err) {
        ultimoError = 'Excepción (' + modelo + '): ' + err.message;
      }
    }
    // Si llegamos acá, los 3 intentos de ESTE modelo fallaron — pasamos al siguiente
  }

  return {
    success: false,
    error: 'Gemini saturado en los 3 modelos (intenté ' + modelos.join(', ') + '). Último: ' + ultimoError + '. Reintentá en 30-60 segundos.'
  };
}


// ============================================================
// GENERAR REPORTE MENSUAL (v5 — bug fix: filasTotal declarado)
// ============================================================
function generarReporteMensual(mes, anio) {
  var ss = getButcherSpreadsheet();
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
  var lineaResumen = 'Generado: ' + new Date().toLocaleDateString('es-AR') + ' | Pedidos del mes: ' + filasDelMes;
  if (pedidosProcesados !== filasDelMes) {
    lineaResumen += ' (' + pedidosProcesados + ' con items reconocidos, ' + (filasDelMes - pedidosProcesados) + ' sin parsear)';
  }
  hojaReporte.getRange(2, 1).setValue(lineaResumen);
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
