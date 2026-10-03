const { TableClient } = require('@azure/data-tables');

const DEFAULT_PASSWORD = 'hochzeit2026';
const TABLE_NAME = process.env.RSVP_TABLE_NAME || 'rsvp';
const CONNECTION_STRING = process.env.AZURE_TABLE_CONNECTION_STRING;

if (!globalThis.__rsvpMemory) {
  globalThis.__rsvpMemory = [];
}

function getPassword() {
  return process.env.RSVP_PASSWORD || DEFAULT_PASSWORD;
}

function normalizeGuestCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function sanitizeInput(value) {
  return String(value ?? '').trim();
}

async function saveRsvp(payload) {
  const record = {
    partitionKey: 'rsvp',
    rowKey: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: sanitizeInput(payload.name),
    guestCount: normalizeGuestCount(payload.guestCount),
    attendance: sanitizeInput(payload.attendance),
    message: sanitizeInput(payload.message),
    createdAt: new Date().toISOString()
  };

  if (!CONNECTION_STRING) {
    globalThis.__rsvpMemory.push(record);
    return record;
  }

  const client = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME);
  await client.createTableIfNotExists();
  await client.upsertEntity(record, 'Merge');
  return record;
}

module.exports = async function (context, req) {
  try {
    const body = req.body || {};
    const action = sanitizeInput(body.action || req.query?.action || 'check-password');

    if (req.method && req.method.toUpperCase() !== 'POST') {
      context.res = { status: 405, body: { error: 'Nur POST ist erlaubt.' } };
      return;
    }

    if (action === 'check-password') {
      const password = sanitizeInput(body.password || '');
      const isValid = password === getPassword();

      context.res = {
        status: isValid ? 200 : 401,
        body: { ok: isValid }
      };
      return;
    }

    if (action === 'submit-rsvp') {
      const name = sanitizeInput(body.name);
      const attendance = sanitizeInput(body.attendance);
      const guestCount = normalizeGuestCount(body.guestCount);
      const message = sanitizeInput(body.message);

      if (!name || !attendance || guestCount <= 0) {
        context.res = {
          status: 400,
          body: { error: 'Bitte ergänze Name, Antwort und Anzahl der Gäste.' }
        };
        return;
      }

      const saved = await saveRsvp({ name, guestCount, attendance, message });

      context.res = {
        status: 200,
        body: {
          ok: true,
          message: `${name}, deine Antwort wurde erfolgreich gespeichert.`,
          data: saved
        }
      };
      return;
    }

    context.res = { status: 400, body: { error: 'Unbekannte Aktion.' } };
  } catch (error) {
    context.res = {
      status: 500,
      body: { error: 'Beim Verarbeiten der Anfrage ist ein Fehler aufgetreten.' }
    };
  }
};
