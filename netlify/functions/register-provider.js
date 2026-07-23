/**
 * register-provider.js — Maestros del Hogar
 *
 * Recibe el webhook de Netlify Forms del formulario /proveedores/
 * y crea el registro del proveedor en Airtable + notifica al admin.
 *
 * Variables de entorno requeridas (mismas que submit-lead):
 *   AIRTABLE_TOKEN, AIRTABLE_BASE_ID, RESEND_API_KEY,
 *   ADMIN_EMAIL, FROM_EMAIL
 */

const https = require('https');

const {
  AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID,
  RESEND_API_KEY,
  ADMIN_EMAIL = 'contacto@maestrosdelhogar.cl',
  FROM_EMAIL  = 'noreply@maestrosdelhogar.cl',
} = process.env;

// ─── HTTP / AIRTABLE / EMAIL ──────────────────────────────────
function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
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
  if (res.status >= 400 || res.body?.error) {
    const errMsg = res.body?.error
      ? `${res.body.error.type || ''}: ${res.body.error.message || JSON.stringify(res.body.error)}`
      : `HTTP ${res.status}`;
    throw new Error(`Airtable rechazó el registro en "${table}" — ${errMsg}`);
  }
  return res.body;
}

async function sendEmail(to, subject, html) {
  const body = JSON.stringify({
    from: `Maestros del Hogar <${FROM_EMAIL}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });
  return httpRequest({
    hostname: 'api.resend.com',
    path: '/emails',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────
function tplWelcomeProvider(data) {
  const svcEmoji = { gasfiter: '🔧', electricista: '⚡', cerrajero: '🔑' };
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
  <div style="background:#0D1B3E;padding:24px 32px">
    <h1 style="color:#fff;font-size:19px;margin:0">✅ Registro recibido — Maestros del Hogar</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#374151;font-size:15px;margin:0 0 18px">Hola <strong>${data.nombre}</strong>, recibimos tu solicitud para unirte al directorio de Maestros del Hogar.</p>
    <div style="background:#F0FDF4;border-radius:8px;padding:16px;border-left:4px solid #22C55E;margin-bottom:22px">
      <p style="margin:0;font-size:14px;color:#166534;line-height:1.6">✓ Revisaremos tu perfil y te contactaremos en las próximas <strong>48 horas hábiles</strong> para confirmar tu publicación en el directorio.</p>
    </div>
    <div style="background:#F9FAFB;border-radius:8px;padding:18px;margin-bottom:22px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em">Tu solicitud</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151"><strong>Servicio:</strong> ${svcEmoji[data.servicio] || ''} ${data.servicio}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151"><strong>Comunas:</strong> ${data.comunas}</p>
      ${data.sec ? `<p style="margin:0;font-size:14px;color:#374151"><strong>Registro SEC:</strong> ${data.sec}</p>` : ''}
    </div>
    <p style="font-size:13px;color:#6B7280;margin:0;line-height:1.6">Mientras tanto, si tienes preguntas puedes responder a este email o escribir a <a href="mailto:${ADMIN_EMAIL}" style="color:#0D1B3E">${ADMIN_EMAIL}</a>.</p>
  </div>
</div>
</body></html>`;
}

function tplNewProviderAdmin(data) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#F4F5F7;font-family:-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#0D1B3E;padding:20px 28px">
    <h1 style="color:#fff;font-size:18px;margin:0">🆕 Nuevo proveedor registrado</h1>
  </div>
  <div style="padding:24px 28px">
    <div style="background:#F9FAFB;border-radius:8px;padding:18px;margin-bottom:18px">
      <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:5px 0;font-weight:600;color:#6B7280;width:110px">Nombre</td><td style="padding:5px 0">${data.nombre}</td></tr>
        <tr><td style="padding:5px 0;font-weight:600;color:#6B7280">Email</td><td style="padding:5px 0"><a href="mailto:${data.email}">${data.email}</a></td></tr>
        <tr><td style="padding:5px 0;font-weight:600;color:#6B7280">Teléfono</td><td style="padding:5px 0"><a href="tel:${data.telefono}">${data.telefono}</a></td></tr>
        <tr><td style="padding:5px 0;font-weight:600;color:#6B7280">Servicio</td><td style="padding:5px 0">${data.servicio}</td></tr>
        <tr><td style="padding:5px 0;font-weight:600;color:#6B7280">Comunas</td><td style="padding:5px 0">${data.comunas}</td></tr>
        ${data.sec ? `<tr><td style="padding:5px 0;font-weight:600;color:#6B7280">SEC</td><td style="padding:5px 0">${data.sec}</td></tr>` : ''}
      </table>
    </div>
    <div style="background:#FFF7ED;border-radius:8px;padding:14px;font-size:13px;color:#92400E">
      <strong>Acción requerida:</strong> Verificar los datos del proveedor y activar su registro en Airtable (cambiar <code>active</code> a TRUE).
    </div>
  </div>
</div>
</body></html>`;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    // Parsear payload de Netlify Forms webhook
    let raw = {};
    try {
      const parsed = JSON.parse(event.body);
      raw = parsed.payload?.data || parsed.data || parsed;
      // Netlify manda el nombre del formulario en payload.form_name (nivel
      // superior), no siempre dentro de "data". Sin este respaldo, formName
      // llegaba vacío y el filtro de abajo descartaba el formulario correcto.
      raw['form-name'] = raw['form-name'] || parsed.payload?.form_name || parsed.form_name || '';
    } catch {
      const params = new URLSearchParams(event.body);
      params.forEach((v, k) => { raw[k] = v; });
    }

    const formName = raw['form-name'] || '';
    if (!formName.includes('registro-proveedor') && !formName.includes('proveedor')) {
      console.log('[register-provider] Form ignorado (no es registro-proveedor):', formName);
      return { statusCode: 200, body: 'ignored' };
    }

    console.log(`[register-provider] Nuevo proveedor: ${raw.nombre} — ${raw.servicio} — ${raw.comunas}`);

    // Crear registro en Airtable (inactive por defecto hasta revisión manual)
    await airtableCreate('providers', {
      name:     raw.nombre   || '',
      email:    raw.email    || '',
      phone:    raw.telefono || '',
      service:  (raw.servicio || '').toLowerCase(),
      communes: raw.comunas  || '',
      sec_number: raw.sec    || '',
      plan:     'basico',
      active:   false, // Se activa manualmente después de verificar
    });

    // Email de bienvenida al proveedor
    if (raw.email) {
      await sendEmail(
        raw.email,
        '✅ Tu solicitud de registro fue recibida — Maestros del Hogar',
        tplWelcomeProvider(raw)
      );
    }

    // Notificación al admin
    await sendEmail(
      ADMIN_EMAIL,
      `🆕 Nuevo proveedor: ${raw.nombre} (${raw.servicio})`,
      tplNewProviderAdmin(raw)
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };

  } catch (err) {
    console.error('[register-provider] Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
