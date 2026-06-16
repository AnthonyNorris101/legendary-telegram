const OVERLAY_ID = "ef-guild-tracker-overlay";

function ensureStyle() {
    if (document.getElementById(`${OVERLAY_ID}-style`)) {
        return;
    }

    const style = document.createElement("style");
    style.id = `${OVERLAY_ID}-style`;
    style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  top: 502px;
  left: 8px;
  z-index: 2147483647;
  box-sizing: border-box;
  width: 230px;
  min-width: 230px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 510px);
  overflow: hidden;
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
#${OVERLAY_ID}.ef-guild-tracker-collapsed {
  min-width: 0;
  width: 38px;
  height: 38px;
  overflow: hidden;
  padding: 9px 11px;
}
#${OVERLAY_ID}.ef-guild-tracker-collapsed > :not(.ef-guild-tracker-header) {
  display: none !important;
}
#${OVERLAY_ID}.ef-guild-tracker-collapsed .ef-guild-tracker-title {
  display: none !important;
}
#${OVERLAY_ID}.ef-guild-tracker-collapsed .ef-guild-tracker-collapse {
  top: -2px;
  left: -4px;
}
#${OVERLAY_ID} .ef-guild-tracker-header {
  position: relative;
  min-height: 20px;
}
#${OVERLAY_ID} .ef-guild-tracker-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 0 24px;
  text-align: center;
}
#${OVERLAY_ID} .ef-guild-tracker-collapse {
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
#${OVERLAY_ID} .ef-guild-tracker-status {
  margin-top: 8px;
  text-align: center;
  min-height: 15px;
}
#${OVERLAY_ID} .ef-guild-tracker-scan {
  width: 100%;
  height: 28px;
  margin-top: 8px;
  border: 1px solid rgba(255, 224, 138, 0.45);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.32);
  color: #ffe08a;
  font: inherit;
  cursor: pointer;
}
#${OVERLAY_ID} .ef-guild-tracker-scan:disabled {
  cursor: default;
  opacity: 0.65;
}
#${OVERLAY_ID} .ef-guild-tracker-body {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 224, 138, 0.20);
  max-height: calc(100vh - 610px);
  overflow: auto;
}
#${OVERLAY_ID} .ef-guild-tracker-row,
#${OVERLAY_ID} .ef-guild-tracker-head {
  display: grid;
  grid-template-columns: minmax(76px, 1fr) 44px 58px;
  gap: 5px;
  align-items: center;
}
#${OVERLAY_ID} .ef-guild-tracker-head {
  color: rgba(255, 224, 138, 0.72);
  margin-bottom: 4px;
}
#${OVERLAY_ID} .ef-guild-tracker-row {
  min-height: 20px;
}
#${OVERLAY_ID} .ef-guild-tracker-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${OVERLAY_ID} .ef-guild-tracker-num {
  text-align: right;
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

function formatNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return "-";
    }
    if (Math.abs(parsed) >= 1000000) {
        return parsed.toExponential(2);
    }
    return Math.floor(parsed).toLocaleString("en-US");
}

function buildRowsHtml(state) {
    const rows = Array.isArray(state.rows) ? state.rows : [];
    if (rows.length === 0) {
        return `<div class="ef-guild-tracker-empty">${escapeHtml(state.emptyText || "No scan yet")}</div>`;
    }

    const sorted = rows
        .slice()
        .sort((left, right) => (Number(right.wave) || 0) - (Number(left.wave) || 0));

    return `<div class="ef-guild-tracker-head">
  <div class="ef-guild-tracker-cell">Name</div>
  <div class="ef-guild-tracker-cell ef-guild-tracker-num">Wave</div>
  <div class="ef-guild-tracker-cell ef-guild-tracker-num">Medal</div>
</div>${sorted.map(row => `<div class="ef-guild-tracker-row">
  <div class="ef-guild-tracker-cell" title="${escapeHtml(row.userName || "")}">${escapeHtml(row.userName || "-")}</div>
  <div class="ef-guild-tracker-cell ef-guild-tracker-num">${escapeHtml(formatNumber(row.wave))}</div>
  <div class="ef-guild-tracker-cell ef-guild-tracker-num">${escapeHtml(formatNumber(row.medal))}</div>
</div>`).join("")}`;
}

export function createGuildTrackerOverlay() {
    ensureStyle();

    const node = document.createElement("div");
    node.id = OVERLAY_ID;
    node.innerHTML = `
<div class="ef-guild-tracker-header">
  <div class="ef-guild-tracker-title">Guild Track</div>
  <button class="ef-guild-tracker-collapse" data-action="toggleCollapse" type="button" aria-label="Minimize Guild Track">-</button>
</div>
<div class="ef-guild-tracker-status">Idle</div>
<button class="ef-guild-tracker-scan" data-action="scanGuild" type="button">Scan Guild</button>
<div class="ef-guild-tracker-body"></div>
`;

    const status = node.querySelector(".ef-guild-tracker-status");
    const scanButton = node.querySelector('[data-action="scanGuild"]');
    const collapseButton = node.querySelector('[data-action="toggleCollapse"]');
    const body = node.querySelector(".ef-guild-tracker-body");
    let collapsed = false;

    document.body.appendChild(node);

    function stopOverlayEvent(event) {
        event.stopPropagation();
    }

    function setCollapsed(nextCollapsed) {
        collapsed = !!nextCollapsed;
        node.classList.toggle("ef-guild-tracker-collapsed", collapsed);
        if (collapseButton) {
            collapseButton.textContent = collapsed ? "+" : "-";
            collapseButton.setAttribute("aria-pressed", collapsed ? "true" : "false");
            collapseButton.setAttribute("aria-label", collapsed ? "Expand Guild Track" : "Minimize Guild Track");
        }
    }

    for (const element of [scanButton, collapseButton, body]) {
        element?.addEventListener("click", stopOverlayEvent);
        element?.addEventListener("pointerdown", stopOverlayEvent);
    }

    collapseButton?.addEventListener("click", (event) => {
        event.preventDefault();
        setCollapsed(!collapsed);
    });
    setCollapsed(false);

    return {
        setState(state) {
            if (status) {
                status.textContent = state.statusText || "Idle";
            }
            if (scanButton) {
                const scanning = state.status === "scanning";
                scanButton.disabled = scanning;
                scanButton.textContent = scanning ? "Scanning..." : "Scan Guild";
            }
            if (body) {
                body.innerHTML = buildRowsHtml(state || {});
            }
        },
        onScan(listener) {
            scanButton?.addEventListener("click", (event) => {
                event.preventDefault();
                listener();
            });
        },
        remove() {
            node.remove();
        }
    };
}
