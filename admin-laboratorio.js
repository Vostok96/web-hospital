import {
  fetchStatusState,
  formatDateTime,
  getStatusPresentation,
  normalizeText,
  parseLaboratorioCatalog,
  saveStatusState,
} from "./lab-status-shared.js";

const state = {
  groups: [],
  remoteItems: {},
};

const elements = {
  password: document.getElementById("adminPassword"),
  updatedBy: document.getElementById("updatedBy"),
  search: document.getElementById("adminSearch"),
  status: document.getElementById("adminStatus"),
  summary: document.getElementById("adminSummary"),
  updatedMeta: document.getElementById("adminUpdatedMeta"),
  groups: document.getElementById("adminGroups"),
  save: document.getElementById("saveStatuses"),
  allAvailable: document.getElementById("markAllAvailable"),
  allUnavailable: document.getElementById("markAllUnavailable"),
};

function setBanner(message, tone = "muted") {
  elements.status.textContent = message;
  elements.status.className = `admin-status admin-status-${tone}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function applyRemoteState(groups, remoteItems) {
  return groups.map((group) => ({
    ...group,
    exams: group.exams.map((exam) => {
      const remote = remoteItems?.[exam.key];
      return {
        ...exam,
        available: typeof remote?.available === "boolean" ? remote.available : exam.available,
      };
    }),
  }));
}

function summarize(groups) {
  const exams = groups.flatMap((group) => group.exams);
  const available = exams.filter((exam) => exam.available).length;
  const unavailable = exams.length - available;
  elements.summary.textContent = `${exams.length} examenes | ${available} disponibles | ${unavailable} agotados`;
}

function updateMeta(remoteState) {
  if (remoteState?.updatedAt) {
    const who = remoteState.updatedBy ? ` por ${remoteState.updatedBy}` : "";
    elements.updatedMeta.textContent = `Ultima publicacion: ${formatDateTime(remoteState.updatedAt)}${who}.`;
    return;
  }

  elements.updatedMeta.textContent =
    "Aun no existe una publicacion central. Al guardar por primera vez, este panel quedara sincronizado.";
}

function bindToggleEvents() {
  elements.groups.querySelectorAll(".admin-toggle").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      const key = toggle.dataset.key;

      state.groups.forEach((group) => {
        group.exams.forEach((exam) => {
          if (exam.key === key) {
            exam.available = toggle.checked;
          }
        });
      });

      summarize(state.groups);
      renderGroups();
    });
  });
}

function renderGroups() {
  const filter = normalizeText(elements.search.value);

  elements.groups.innerHTML = state.groups
    .map((group) => {
      const filteredExams = group.exams.filter((exam) => {
        if (!filter) {
          return true;
        }

        return (
          normalizeText(exam.name).includes(filter) ||
          normalizeText(exam.detailId).includes(filter) ||
          normalizeText(group.title).includes(filter)
        );
      });

      if (!filteredExams.length) {
        return "";
      }

      const items = filteredExams
        .map((exam) => {
          const presentation = getStatusPresentation(exam.available);

          return `
            <label class="admin-exam-row" data-key="${escapeHtml(exam.key)}">
              <div class="admin-exam-copy">
                <span class="admin-exam-name">${escapeHtml(exam.name)}</span>
                <span class="admin-exam-meta">${escapeHtml(exam.detailId || "sin-detalle")}</span>
              </div>
              <div class="admin-toggle-wrap">
                <span class="admin-toggle-label ${presentation.className}">${presentation.label}</span>
                <input type="checkbox" class="admin-toggle" data-key="${escapeHtml(exam.key)}" ${
                  exam.available ? "checked" : ""
                }>
              </div>
            </label>
          `;
        })
        .join("");

      return `
        <section class="admin-group">
          <div class="admin-group-title">${escapeHtml(group.title)}</div>
          <div class="admin-group-body">${items}</div>
        </section>
      `;
    })
    .join("");

  bindToggleEvents();
}

function setAllStatuses(available) {
  state.groups.forEach((group) => {
    group.exams.forEach((exam) => {
      exam.available = available;
    });
  });

  summarize(state.groups);
  renderGroups();
}

function buildPayload() {
  const items = {};

  state.groups.flatMap((group) => group.exams).forEach((exam) => {
    items[exam.key] = {
      available: exam.available,
      name: exam.name,
      detailId: exam.detailId,
      category: exam.category,
      updatedAt: new Date().toISOString(),
    };
  });

  return items;
}

async function loadCatalog() {
  setBanner("Cargando catalogo del laboratorio...", "muted");

  const [catalogResponse, remoteState] = await Promise.all([
    fetch("laboratorio.html", { cache: "no-store" }),
    fetchStatusState().catch(() => ({ items: {}, updatedAt: null, updatedBy: null })),
  ]);

  const catalogHtml = await catalogResponse.text();
  const groups = parseLaboratorioCatalog(catalogHtml);

  state.remoteItems = remoteState.items || {};
  state.groups = applyRemoteState(groups, state.remoteItems);

  summarize(state.groups);
  updateMeta(remoteState);
  renderGroups();
  setBanner("Panel listo. Cambia los switches y guarda.", "success");
}

async function saveChanges() {
  const password = elements.password.value.trim();

  if (!password) {
    setBanner("Ingresa la clave de administrador para guardar.", "error");
    elements.password.focus();
    return;
  }

  const previousLabel = elements.save.textContent;
  elements.save.disabled = true;
  elements.save.textContent = "Guardando...";
  setBanner("Publicando cambios en el estado del laboratorio...", "muted");

  try {
    const updatedBy = elements.updatedBy.value.trim() || "Administrador";
    const response = await saveStatusState({
      password,
      updatedBy,
      items: buildPayload(),
    });

    updateMeta(response);
    setBanner("Cambios publicados correctamente.", "success");
  } catch (error) {
    setBanner(error?.message || "No se pudo guardar el estado.", "error");
  } finally {
    elements.save.disabled = false;
    elements.save.textContent = previousLabel;
  }
}

elements.search.addEventListener("input", renderGroups);
elements.save.addEventListener("click", saveChanges);
elements.allAvailable.addEventListener("click", () => setAllStatuses(true));
elements.allUnavailable.addEventListener("click", () => setAllStatuses(false));

loadCatalog().catch((error) => {
  setBanner(error?.message || "No se pudo cargar el panel administrativo.", "error");
});
