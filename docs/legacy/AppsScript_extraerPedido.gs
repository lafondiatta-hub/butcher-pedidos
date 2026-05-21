// ============================================================
// THE BUTCHER — Apps Script: NUEVA ACCIÓN "extraerPedido"
//
// Lo que hace: recibe una imagen (base64) o texto del pedido,
// llama a Gemini 2.0 Flash (free tier) y devuelve los datos
// estructurados (cliente, items, dirección, horario, etc.) para
// que la app autocomplete el formulario.
//
// PASOS DE SETUP (manual, 1 sola vez):
//   1. Conseguir API key de Gemini gratis:
//      https://aistudio.google.com/apikey
//   2. En el Apps Script, ir a:
//      ⚙️ Configuración del proyecto → Propiedades del script
//      → "Agregar propiedad de secuencia de comandos"
//      Nombre: GEMINI_API_KEY
//      Valor: (la API key que copiaste de Google AI Studio)
//   3. Pegar este archivo entero al final de tu Apps Script (junto a editarPedido).
//   4. En doPost, agregar también este bloque:
//        } else if (action === 'extraerPedido') {
//          result = extraerPedido(data);
//   5. Guardar → Implementar → NUEVA implementación.
//   6. Copiar URL /exec nueva → pegarla en Configuración de la app.
//
// LÍMITES Gemini Flash free tier (a 2026-05):
//   - 15 requests por minuto
//   - 1.500 requests por día
//   Más que suficiente para uso normal de Butcher.
// ============================================================


// ---------- PEGAR EN doPost (junto a los otros if/else) ----------
//
//   } else if (action === 'extraerPedido') {
//     result = extraerPedido(data);
//
// ------------------------------------------------------------------


// ============================================================
// EXTRAER PEDIDO con Gemini
//
// data esperado desde la app:
// {
//   action: 'extraerPedido',
//   texto: '...' (string opcional),
//   imagenBase64: 'data:image/png;base64,XXXX' (opcional),
//   catalogo: ['Asado', 'Vacío', ...] (lista de nombres de productos
//             del catálogo actual, para ayudar al matching),
//   listaActiva: 'Mayorista' (nombre de la lista de precios activa)
// }
// ============================================================
function extraerPedido(data) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return {
      success: false,
      error: 'Falta GEMINI_API_KEY en Propiedades del script. Ver instrucciones en el .gs.'
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
    '  "fecha": "YYYY-MM-DD",  // si se menciona "hoy" usá la fecha actual de Buenos Aires\n' +
    '  "fechaEntrega": "YYYY-MM-DD",  // si difiere de la fecha del pedido\n' +
    '  "vendedor": "JP" | "Camba" | "Chino" | "Ficha" | "Toto" | "Agus Camba" | "Mariana" | "TDN",\n' +
    '  "tipoEnvio": "delivery" | "retiro",  // delivery si hay dirección/envío; retiro si dice "paso a buscar"\n' +
    '  "horario": "11 a 14 hs" | "13 a 17 hs" | "16 a 20 hs" | "Todo el día" | "<texto libre>",\n' +
    '  "items": [\n' +
    '    {\n' +
    '      "producto": "Nombre del producto (mejor si coincide con catálogo)",\n' +
    '      "tipo": "kg" | "unidad",\n' +
    '      "cantidad": 1.5,  // en kg o unidades. Si no se sabe, omitir o poner 0\n' +
    '      "precio": 0  // omitir si no se menciona — el precio sale del catálogo\n' +
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

  // Armar el payload Gemini
  var parts = [{ text: prompt }];
  if (data.imagenBase64) {
    // Separar el prefijo "data:image/png;base64,"
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
      // A veces Gemini devuelve el JSON envuelto en ```json — limpiar
      var clean = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      try { datos = JSON.parse(clean); }
      catch(e2) { return { success: false, error: 'JSON inválido de Gemini: ' + rawJson.slice(0, 300) }; }
    }
    return { success: true, datos: datos };
  } catch(err) {
    return { success: false, error: 'Excepción: ' + err.message };
  }
}
