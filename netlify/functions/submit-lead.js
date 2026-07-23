/**
 * submit-lead.js — Maestros del Hogar
 *
 * Recibe el webhook de Netlify Forms cuando un usuario envía
 * cualquier formulario del sitio. Flujo:
 *
 * 1. Parsea servicio + comuna del nombre del formulario
 * 2. Busca el proveedor activo en Airtable para ese servicio+comuna
 * 3. Envía email al proveedor con los datos del lead
 * 4. Envía confirmación al usuario (si dejó email)
 * 5. Si no hay proveedor disponible, notifica al admin
 * 6. Registra el lead en Airtable (tabla leads)
 *
 * Variables de entorno requeridas (Netlify → Site settings → Env vars):
 *   AIRTABLE_TOKEN      — Personal Access Token de Airtable
 *   AIRTABLE_BASE_ID    — ID del base (empieza con "app")
 *   RESEND_API_KEY      — API key de Resend (resend.com)
 *   ADMIN_EMAIL         — Email donde llegan los leads sin proveedor
 *   FROM_EMAIL          — Dirección de envío (debe estar verificada en Resend)
 */

const https = require('https');

// ─── CONFIG ──────────────────────────────────────────────────
const {
  AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID,
  RESEND_API_KEY,
  ADMIN_EMAIL = 'contacto@maestrosdelhogar.cl',
  FROM_EMAIL  = 'noreply@maestrosdelhogar.cl',
} = process.env;

// ─── DISPLAY NAMES ───────────────────────────────────────────
const COMMUNE_NAMES = {
  'las-condes':       'Las Condes',
  'nunoa':            'Ñuñoa',
  'providencia':      'Providencia',
  'la-florida':       'La Florida',
  'maipu':            'Maipú',
  'puente-alto':      'Puente Alto',
  'santiago-centro':  'Santiago Centro',
  'macul':            'Macul',
  'recoleta':         'Recoleta',
  'penalolen':        'Peñalolén',
  'san-miguel':       'San Miguel',
  'vitacura':         'Vitacura',
  'la-reina':         'La Reina',
  'lo-barnechea':     'Lo Barnechea',
  'estacion-central': 'Estación Central',
};

const SERVICE_NAMES = {
  gasfiter:     'Gasfiter',
  electricista: 'Electricista',
  cerrajero:    'Cerrajero',
};

const SERVICE_EMOJI = {
  gasfiter:     '🔧',
  electricista: '⚡',
  cerrajero:    '🔑',
};

// ─── HTTP HELPERS ─────────────────────────────────────────────
function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ─── AIRTABLE ─────────────────────────────────────────────────
async function airtableGet(table, formula) {
  const path = `/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}` +
    `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await httpRequest({
    hostname: 'api.airtable.com',
    path,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` },
  });
  return res.body;
}

async function airtableCreate(table, fields) {
  const body = JSON.stringify({ records: [{ fields }] });
  const res = await httpRequest({
    hostname: 'api.airtable.com',
    path: `/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
  return res.body;
}

// ─── RESEND EMAIL ─────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const body = JSON.stringify({
    from: `Maestros del Hogar <${FROM_EMAIL}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });
  const res = await httpRequest({
    hostname: 'api.resend.com',
    path: '/emails',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
  if (res.status >= 400) {
    console.error('Resend error:', JSON.stringify(res.body));
  }
  return res.body;
}

// ─── PARSE FORM NAME → SERVICE + COMMUNE ─────────────────────
// Nombres de formulario: contacto-gasfiter-las-condes
//                        contacto-electricista-providencia
//                        contacto-gasfiter-urgencia (sub-service)
function parseFormName(formName, explicitData) {
  // Explicit hidden fields override (set in form HTML)
  if (explicitData.servicio && explicitData.comuna) {
    return {
      service: explicitData.servicio.toLowerCase(),
      commune: explicitData.comuna.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-'),
    };
  }

  const clean = (formName || '').replace(/^contacto-/, '');
  const services = Object.keys(SERVICE_NAMES);
  let service = '';
  let communeParts = [];

  for (const part of clean.split('-')) {
    if (!service && services.includes(part)) {
      service = part;
    } else if (service) {
      communeParts.push(part);
    }
  }

  return { service, commune: communeParts.join('-') };
}

// ─── FIND PROVIDER IN AIRTABLE ───────────────────────────────
async function findProvider(service, commune) {
  const communeName = COMMUNE_NAMES[commune] || commune;
  // Formula: proveedor activo que cubre ese servicio y esa comuna
  const formula = `AND(
    {active}=TRUE(),
    LOWER({service})="${service}",
    FIND("${communeName}",{communes})>0
  )`;
  const result = await airtableGet('providers', formula);
  return result.records && result.records.length > 0
    ? result.records[0]
    : null;
}

// ─── LOG LEAD ────────────────────────────────────────────────
async function logLead(data, service, commune, provider) {
  const communeName = COMMUNE_NAMES[commune] || commune;
  return airtableCreate('leads', {
    user_name:    data.nombre   || '',
    user_phone:   data.telefono || '',
    user_email:   data.email    || '',
    problem:      data.problema || '',
    service:      SERVICE_NAMES[service] || service,
    commune:      communeName,
    provider_name: provider ? provider.fields.name : '',
    status:       provider ? 'sent' : 'unassigned',
    source_form:  data['form-name'] || '',
    created_at:   new Date().toISOString(),
  });
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────
function tplProvider(provider, lead) {
  const { service, commune, nombre, telefono, problema } = lead;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
  <div style="background:#0D1B3E;padding:24px 32px;display:flex;align-items:center;gap:12px">
    <span style="font-size:28px">🔔</span>
    <div>
      <p style="color:rgba(255,255,255,.55);font-size:11px;margin:0;text-transform:uppercase;letter-spacing:.08em">Nuevo lead</p>
      <h1 style="color:#fff;font-size:19px;margin:4px 0 0;font-weight:700">${service} en ${commune}</h1>
    </div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#374151;font-size:15px;margin:0 0 20px">Hola <strong>${provider.fields.name}</strong>, tienes una nueva solicitud:</p>
    <div style="background:#F9FAFB;border-radius:8px;padding:20px;border-left:4px solid #F5820D;margin-bottom:22px">
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151">
        <tr><td style="padding:6px 0;font-weight:600;color:#6B7280;width:110px;vertical-align:top">Servicio</td><td style="padding:6px 0;font-weight:700">${service} en ${commune}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;color:#6B7280;vertical-align:top">Cliente</td><td style="padding:6px 0"><strong>${nombre}</strong></td></tr>
        <tr><td style="padding:6px 0;font-weight:600;color:#6B7280;vertical-align:top">Teléfono</td><td style="padding:6px 0"><a href="tel:${telefono}" style="color:#F5820D;font-weight:700;font-size:16px">${telefono}</a></td></tr>
        <tr><td style="padding:6px 0;font-weight:600;color:#6B7280;vertical-align:top">Problema</td><td style="padding:6px 0">${problema}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;color:#6B7280;vertical-align:top">Hora</td><td style="padding:6px 0;color:#9CA3AF">${new Date().toLocaleString('es-CL',{timeZone:'America/Santiago'})}</td></tr>
      </table>
    </div>
    <a href="tel:${telefono}" style="display:block;background:#F5820D;color:#fff;text-align:center;padding:15px 24px;border-radius:8px;font-size:16px;font-weight:700;text-decoration:none;margin-bottom:16px">📞 Llamar al cliente ahora →</a>
    <div style="background:#EFF6FF;border-radius:8px;padding:14px;font-size:13px;color:#1E40AF;margin-bottom:20px">
      <strong>Recuerda:</strong> Entregar el presupuesto antes de empezar el trabajo y emitir boleta o factura al terminar.
    </div>
    <p style="font-size:11px;color:#9CA3AF;margin:0;line-height:1.6">Recibiste este lead porque estás registrado en <a href="https://www.maestrosdelhogar.cl" style="color:#0D1B3E">Maestros del Hogar</a> para ${service} en ${commune}. El pago y la relación con el cliente es directamente entre tú y él.</p>
  </div>
</div>
</body></html>`;
}

function tplUser(nombre, service, commune) {
  const emoji = SERVICE_EMOJI[service] || '✅';
  const svcName = SERVICE_NAMES[service] || service;
  const communeName = COMMUNE_NAMES[commune] || commune;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
  <div style="background:#0D1B3E;padding:24px 32px">
    <p style="color:rgba(255,255,255,.55);font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em">Solicitud recibida</p>
    <h1 style="color:#fff;font-size:19px;margin:0;font-weight:700">${emoji} ${svcName} en ${communeName}</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#374151;font-size:15px;margin:0 0 18px">Hola <strong>${nombre}</strong>, recibimos tu solicitud y ya estamos buscando el técnico disponible más cercano a tu dirección.</p>
    <div style="background:#F0FDF4;border-radius:8px;padding:16px;border-left:4px solid #22C55E;margin-bottom:22px">
      <p style="margin:0;font-size:14px;color:#166534;line-height:1.6">✓ Tu solicitud fue enviada al ${svcName.toLowerCase()} disponible en ${communeName}. Te contactarán a la brevedad para confirmar la visita y darte el presupuesto.</p>
    </div>
    <p style="font-size:14px;font-weight:600;color:#374151;margin-bottom:10px">Mientras esperas:</p>
    <ul style="font-size:14px;color:#6B7280;padding-left:20px;margin:0 0 22px;line-height:1.9">
      <li>El técnico te llama directamente — no necesitas hacer nada más</li>
      <li>Pide el presupuesto total antes de que empiece el trabajo</li>
      <li>Si no te contactan en 3 horas, puedes volver a solicitar</li>
    </ul>
    <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.6"><a href="https://www.maestrosdelhogar.cl" style="color:#0D1B3E;font-weight:600">Maestros del Hogar</a> — Directorio de técnicos a domicilio en Santiago de Chile</p>
  </div>
</div>
</body></html>`;
}

function tplAdmin(data, service, commune) {
  const svcName = SERVICE_NAMES[service] || service;
  const communeName = COMMUNE_NAMES[commune] || commune;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#F4F5F7;font-family:-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#7F1D1D;padding:20px 28px">
    <h1 style="color:#fff;font-size:18px;margin:0">⚠️ Lead sin proveedor — acción requerida</h1>
  </div>
  <div style="padding:24px 28px">
    <p style="color:#374151;font-size:14px;margin:0 0 16px">No se encontró un proveedor activo para esta solicitud. Requiere asignación manual:</p>
    <div style="background:#FEF2F2;border-radius:8px;padding:18px;margin-bottom:18px;border-left:4px solid #EF4444">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#991B1B;text-transform:uppercase">Sin asignar</p>
      <p style="margin:0 0 6px;font-size:14px;color:#7F1D1D"><strong>Servicio:</strong> ${svcName} en ${communeName}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#7F1D1D"><strong>Cliente:</strong> ${data.nombre}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#7F1D1D"><strong>Teléfono:</strong> <a href="tel:${data.telefono}" style="color:#DC2626">${data.telefono}</a></p>
      <p style="margin:0;font-size:14px;color:#7F1D1D"><strong>Problema:</strong> ${data.problema}</p>
    </div>
    <p style="font-size:13px;color:#6B7280;margin:0">Acción requerida: contactar manualmente al cliente o asignar un técnico disponible. Revisar si hay proveedores que puedan cubrir ${communeName} y activarlos en Airtable.</p>
  </div>
</div>
</body></html>`;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────
exports.handler = async (event) => {
  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Verificar variables de entorno
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !RESEND_API_KEY) {
    console.error('Missing environment variables');
    return { statusCode: 500, body: 'Configuration error' };
  }

  try {
    // Netlify Forms webhook → payload en JSON con campo "payload"
    let raw = {};
    try {
      const parsed = JSON.parse(event.body);
      raw = parsed.payload?.data || parsed.data || parsed;
    } catch {
      // Fallback: form-urlencoded directo
      const params = new URLSearchParams(event.body);
      params.forEach((v, k) => { raw[k] = v; });
    }

    const formName = raw['form-name'] || '';
    const { service, commune } = parseFormName(formName, raw);

    console.log(`[submit-lead] form="${formName}" service="${service}" commune="${commune}" user="${raw.nombre}"`);

    if (!service) {
      console.warn('[submit-lead] No se pudo determinar el servicio del formulario:', formName);
    }

    // Buscar proveedor disponible
    const provider = service ? await findProvider(service, commune) : null;
    console.log(`[submit-lead] Provider: ${provider ? provider.fields.name : 'ninguno'}`);

    // Registrar lead en Airtable
    try {
      await logLead(raw, service, commune, provider);
    } catch (err) {
      console.error('[submit-lead] Error al registrar lead en Airtable:', err.message);
      // No bloquea el flujo — el email es más importante
    }

    if (provider) {
      // Notificar al proveedor
      await sendEmail(
        provider.fields.email,
        `🔔 Nuevo lead — ${SERVICE_NAMES[service] || service} en ${COMMUNE_NAMES[commune] || commune}`,
        tplProvider(provider, {
          service: SERVICE_NAMES[service] || service,
          commune: COMMUNE_NAMES[commune] || commune,
          nombre:  raw.nombre   || 'Sin nombre',
          telefono: raw.telefono || 'Sin teléfono',
          problema: raw.problema || 'Sin descripción',
        })
      );
      console.log(`[submit-lead] Email enviado a proveedor: ${provider.fields.email}`);
    } else {
      // Sin proveedor → notificar al admin
      await sendEmail(
        ADMIN_EMAIL,
        `⚠️ Lead sin proveedor — ${SERVICE_NAMES[service] || service} en ${COMMUNE_NAMES[commune] || commune}`,
        tplAdmin(raw, service, commune)
      );
      console.log(`[submit-lead] Admin notificado por lead sin proveedor`);
    }

    // Confirmación al usuario (si dejó email)
    if (raw.email) {
      await sendEmail(
        raw.email,
        `✅ Solicitud recibida — ${SERVICE_NAMES[service] || service} en ${COMMUNE_NAMES[commune] || commune}`,
        tplUser(raw.nombre || '', service, commune)
      );
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, provider: provider ? provider.fields.name : null }),
    };

  } catch (err) {
    console.error('[submit-lead] Error crítico:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
