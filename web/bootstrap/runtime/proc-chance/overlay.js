const OVERLAY_ID = "ef-proc-chance-overlay";

function ensureStyle() {
    if (document.getElementById(`${OVERLAY_ID}-style`)) {
        return;
    }

    const style = document.createElement("style");
    style.id = `${OVERLAY_ID}-style`;
    style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  top: 374px;
  left: 8px;
  z-index: 2147483647;
  box-sizing: border-box;
  width: 230px;
  min-width: 230px;
  max-width: calc(100vw - 16px);
  padding: 9px 11px;
  border: 1px solid rgba(255, 224, 138, 0.35);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.72);
  color: #ffe08a;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.25;
  pointer-events: auto;
}
#${OVERLAY_ID}.ef-proc-chance-collapsed {
  min-width: 0;
  width: 38px;
  overflow: hidden;
  padding: 9px 11px;
}
#${OVERLAY_ID}.ef-proc-chance-collapsed > :not(.ef-proc-chance-header) {
  display: none !important;
}
#${OVERLAY_ID}.ef-proc-chance-collapsed .ef-proc-chance-title {
  display: none !important;
}
#${OVERLAY_ID}.ef-proc-chance-collapsed .ef-proc-chance-collapse {
  top: -2px;
  left: -4px;
}
#${OVERLAY_ID} .ef-proc-chance-header {
  position: relative;
  min-height: 20px;
}
#${OVERLAY_ID} .ef-proc-chance-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 0 24px;
  text-align: center;
}
#${OVERLAY_ID} .ef-proc-chance-collapse {
  position: absolute;
  top: -2px;
  left: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 224, 138, 0.45);
  border-radius: 3px;
  background: rgba(255, 224, 138, 0.12);
  color: #ffe08a;
  font: inherit;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}
#${OVERLAY_ID} .ef-proc-chance-status {
  margin-top: 8px;
  text-align: center;
}
#${OVERLAY_ID} .ef-proc-chance-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 7px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 224, 138, 0.20);
}
#${OVERLAY_ID} .ef-proc-chance-row {
  display: grid;
  grid-template-columns: minmax(86px, 1fr) 54px 34px;
  gap: 6px;
  align-items: center;
}
#${OVERLAY_ID} .ef-proc-chance-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${OVERLAY_ID} .ef-proc-chance-value {
  min-width: 0;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 224, 138, 0.42);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.28);
  color: #ffe08a;
}
#${OVERLAY_ID} .ef-proc-chance-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
}
#${OVERLAY_ID} .ef-proc-chance-toggle input {
  width: 16px;
  height: 16px;
  margin: 0;
}
`;
    document.head.appendChild(style);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatPercent(value, enabled) {
    if (!enabled) {
        return "Off";
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `${Math.max(0, Math.round(parsed))}%` : "100%";
}

function buildRowsHtml(state) {
    const fairyEnabled = state.fairySkillSkipEnabled !== false;
    const priestEnabled = state.priestSpeedBuffEnabled !== false;
    return `<div class="ef-proc-chance-row">
  <div class="ef-proc-chance-name">Fairy Skip</div>
  <div class="ef-proc-chance-value">${escapeHtml(formatPercent(state.fairySkillSkipValue, fairyEnabled))}</div>
  <label class="ef-proc-chance-toggle"><input data-proc-toggle="fairy" type="checkbox"${fairyEnabled ? " checked" : ""}></label>
</div>
<div class="ef-proc-chance-row">
  <div class="ef-proc-chance-name">Priest Speed</div>
  <div class="ef-proc-chance-value">${escapeHtml(formatPercent(state.priestSpeedBuffValue, priestEnabled))}</div>
  <label class="ef-proc-chance-toggle"><input data-proc-toggle="priest" type="checkbox"${priestEnabled ? " checked" : ""}></label>
</div>`;
}

export function createProcChanceOverlay() {
    ensureStyle();

    const node = document.createElement("div");
    node.id = OVERLAY_ID;
    node.innerHTML = `
<div class="ef-proc-chance-header">
  <div class="ef-proc-chance-title">Proc Chance</div>
  <button class="ef-proc-chance-collapse" data-action="toggleCollapse" type="button" aria-label="Minimize Proc Chance">-</button>
</div>
<div class="ef-proc-chance-status">Scanning...</div>
<div class="ef-proc-chance-list"></div>
`;

    const status = node.querySelector(".ef-proc-chance-status");
    const collapseButton = node.querySelector('[data-action="toggleCollapse"]');
    const list = node.querySelector(".ef-proc-chance-list");
    let collapsed = false;

    document.body.appendChild(node);

    function stopOverlayEvent(event) {
        event.stopPropagation();
    }

    function setCollapsed(nextCollapsed) {
        collapsed = !!nextCollapsed;
        node.classList.toggle("ef-proc-chance-collapsed", collapsed);
        if (collapseButton) {
            collapseButton.textContent = collapsed ? "+" : "-";
            collapseButton.setAttribute("aria-pressed", collapsed ? "true" : "false");
            collapseButton.setAttribute("aria-label", collapsed ? "Expand Proc Chance" : "Minimize Proc Chance");
        }
    }

    for (const element of [collapseButton, list]) {
        element?.addEventListener("click", stopOverlayEvent);
        element?.addEventListener("pointerdown", stopOverlayEvent);
        element?.addEventListener("input", stopOverlayEvent);
    }

    collapseButton?.addEventListener("click", (event) => {
        event.preventDefault();
        setCollapsed(!collapsed);
    });
    setCollapsed(false);

    return {
        setState(state) {
            if (status) {
                const buffReady = state.buffManagerDetected === true;
                const heroReady = state.heroUniqueSkillDetected === true;
                status.textContent = buffReady && heroReady ? "Live" : "Scanning...";
            }
            if (list) {
                list.innerHTML = buildRowsHtml(state || {});
            }
        },
        setError(message) {
            if (status) {
                status.textContent = message;
            }
        },
        onToggle(listener) {
            list?.addEventListener("change", (event) => {
                const input = event.target?.closest?.("[data-proc-toggle]");
                if (!input) {
                    return;
                }
                listener(input.getAttribute("data-proc-toggle") || "", input.checked === true);
            });
        },
        remove() {
            node.remove();
        }
    };
}
