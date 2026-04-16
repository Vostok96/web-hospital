import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "lab-status";
const STORE_KEY = "laboratorio";
const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function safeTrim(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function isValidKey(value) {
  return /^[a-z0-9-]{3,180}$/.test(value);
}

function sanitizeItems(items) {
  if (!items || typeof items !== "object") {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(items)) {
    if (!isValidKey(key) || !value || typeof value !== "object") {
      continue;
    }

    sanitized[key] = {
      available: Boolean(value.available),
      name: safeTrim(value.name, 180),
      detailId: safeTrim(value.detailId, 120),
      category: safeTrim(value.category, 160),
      updatedAt:
        typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    };
  }

  return sanitized;
}

function passwordsMatch(expected, provided) {
  if (typeof expected !== "string" || typeof provided !== "string") {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function readState(store) {
  const data = await store.get(STORE_KEY, { type: "json" });

  if (!data || typeof data !== "object") {
    return {
      items: {},
      total: 0,
      updatedAt: null,
      updatedBy: null,
    };
  }

  const items = sanitizeItems(data.items);

  return {
    items,
    total: Object.keys(items).length,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...JSON_HEADERS,
        "access-control-allow-headers": "content-type,x-admin-password",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    });
  }

  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    const state = await readState(store);
    return jsonResponse({ ok: true, ...state });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "Metodo no permitido.",
      },
      405,
    );
  }

  const adminPassword = process.env.LAB_ADMIN_PASSWORD;

  if (!adminPassword) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Falta configurar LAB_ADMIN_PASSWORD en las variables de entorno de Netlify.",
      },
      503,
    );
  }

  const providedPassword = request.headers.get("x-admin-password");

  if (!passwordsMatch(adminPassword, providedPassword)) {
    return jsonResponse(
      {
        ok: false,
        error: "Credenciales invalidas.",
      },
      401,
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "El cuerpo debe estar en JSON.",
      },
      400,
    );
  }

  const items = sanitizeItems(body?.items);
  const updatedAt = new Date().toISOString();
  const updatedBy = safeTrim(body?.updatedBy, 80) || "Administrador";
  const nextState = {
    items,
    total: Object.keys(items).length,
    updatedAt,
    updatedBy,
  };

  await store.setJSON(STORE_KEY, nextState);

  return jsonResponse({
    ok: true,
    ...nextState,
  });
}
