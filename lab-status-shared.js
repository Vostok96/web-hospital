const STATUS_ENDPOINT = "/.netlify/functions/lab-status";

export function normalizeText(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function extractDetailId(href) {
  if (!href) {
    return "";
  }

  try {
    const url = new URL(href, window.location.origin);
    return (url.searchParams.get("id") || "").trim();
  } catch {
    return "";
  }
}

export function buildExamKey({ name, href, detailId }) {
  const resolvedDetailId = detailId || extractDetailId(href) || "sin-detalle";
  const resolvedName = name || "sin-nombre";
  return `${slugify(resolvedDetailId)}-${slugify(resolvedName)}`;
}

export function getStatusPresentation(available) {
  return available
    ? { label: "DISPONIBLE", className: "ok" }
    : { label: "AGOTADO", className: "no" };
}

export function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export async function fetchStatusState() {
  const response = await fetch(STATUS_ENDPOINT, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload?.error || "No se pudo obtener el estado central.";
    throw new Error(error);
  }

  return payload;
}

export async function saveStatusState({ password, updatedBy, items }) {
  const response = await fetch(STATUS_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-admin-password": password,
    },
    body: JSON.stringify({
      items,
      updatedBy,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo guardar el estado.");
  }

  return payload;
}

export function parseLaboratorioCatalog(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  return Array.from(doc.querySelectorAll(".card"))
    .map((card) => {
      const title =
        card.querySelector(".card-header h3")?.textContent?.trim() || "Sin categoria";

      const exams = Array.from(card.querySelectorAll("a.exam-link"))
        .map((link) => {
          const item = link.closest("li");
          const statusNode = item?.querySelector(".status");
          const name = link.textContent.trim();
          const href = link.getAttribute("href") || "";
          const detailId = extractDetailId(href);

          return {
            key: buildExamKey({ name, href, detailId }),
            name,
            href,
            detailId,
            category: title,
            available: !statusNode || statusNode.classList.contains("ok"),
          };
        })
        .filter((exam) => exam.name);

      return { title, exams };
    })
    .filter((group) => group.exams.length > 0);
}
