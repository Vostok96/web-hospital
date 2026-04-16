import {
  buildExamKey,
  extractDetailId,
  fetchStatusState,
  formatDateTime,
  getStatusPresentation,
} from "./lab-status-shared.js";

function setStatusMeta(message, tone) {
  const meta = document.getElementById("status-sync-meta");

  if (!meta) {
    return;
  }

  meta.textContent = message;
  meta.classList.remove("is-error", "is-success", "is-muted");

  if (tone) {
    meta.classList.add(tone);
  }
}

function collectExamRows() {
  return Array.from(document.querySelectorAll("a.exam-link"))
    .map((link) => {
      const item = link.closest("li");
      const statusNode = item?.querySelector(".status");

      if (!item || !statusNode) {
        return null;
      }

      const name = link.textContent.trim();
      const href = link.getAttribute("href") || "";
      const detailId = extractDetailId(href);

      return {
        item,
        statusNode,
        key: buildExamKey({ name, href, detailId }),
      };
    })
    .filter(Boolean);
}

function applyStatus(statusNode, available) {
  const presentation = getStatusPresentation(available);
  statusNode.textContent = presentation.label;
  statusNode.classList.remove("ok", "no");
  statusNode.classList.add(presentation.className);
}

async function syncStatuses() {
  const rows = collectExamRows();

  if (!rows.length) {
    return;
  }

  setStatusMeta("Consultando estado central del laboratorio...", "is-muted");

  try {
    const state = await fetchStatusState();
    let applied = 0;

    rows.forEach((row) => {
      const current = state.items?.[row.key];

      if (!current) {
        return;
      }

      applyStatus(row.statusNode, current.available);
      applied += 1;
    });

    if (state.updatedAt) {
      const who = state.updatedBy ? ` por ${state.updatedBy}` : "";
      setStatusMeta(
        `Ultima actualizacion: ${formatDateTime(state.updatedAt)}${who}.`,
        "is-success",
      );
      return;
    }

    if (applied > 0) {
      setStatusMeta("Estado central aplicado correctamente.", "is-success");
      return;
    }

    setStatusMeta(
      "Panel administrativo listo. Aun no se ha registrado una actualizacion central.",
      "is-muted",
    );
  } catch (error) {
    setStatusMeta(
      error?.message ||
        "No fue posible sincronizar el estado central. Se muestra el catalogo base.",
      "is-error",
    );
  }
}

syncStatuses();
