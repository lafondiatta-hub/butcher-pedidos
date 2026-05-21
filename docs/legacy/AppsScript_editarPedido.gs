// ============================================================
// THE BUTCHER — Apps Script: NUEVA ACCIÓN "editarPedido"
//
// Cómo usar:
//  1. En tu Apps Script v4 actual, dentro de doPost(),
//     agregá el bloque marcado "PEGAR EN doPost".
//  2. Pegá la función editarPedido() completa al final del archivo
//     (antes de los HELPERS está bien).
//  3. Guardar (Ctrl+S) → Implementar → NUEVA implementación.
//  4. Copiar la URL /exec nueva y actualizarla en la app (Configuración).
//
// IMPORTANTE: la app debe mandar el campo "filaSheet" o, en su
// defecto, el "clienteOriginal" + "fechaOriginal" (los datos
// ANTERIORES a la edición) para poder encontrar la fila correcta.
// ============================================================


// ---------- PEGAR EN doPost (junto a los otros if/else) ----------
//
//   } else if (action === 'editarPedido') {
//     result = editarPedido(data);
//
// ------------------------------------------------------------------


// ============================================================
// EDITAR PEDIDO
// Busca la fila por (clienteOriginal + fechaOriginal) y reescribe
// las 19 columnas con los datos nuevos del pedido.
//
// data esperado desde la app:
// {
//   action: 'editarPedido',
//   clienteOriginal: 'Nombre viejo',   // para ENCONTRAR la fila
//   fechaOriginal: '2026-05-21',       // YYYY-MM-DD, para encontrar la fila
//   pedido: { ...mismo shape que guardarPedido... }  // datos NUEVOS
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
      var fechaFilaStr = normalizarFecha(datos[i][2]); // col C
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
// HELPER: normalizar fecha de una celda a 'YYYY-MM-DD'
// (extraído de la lógica que ya usás en actualizarPago)
// ============================================================
function normalizarFecha(valor) {
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
