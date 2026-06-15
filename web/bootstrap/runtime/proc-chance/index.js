import { installObjectPropertyCandidateDetector } from "../property-detector.js";
import { createProcChanceOverlay } from "./overlay.js";

const PROC_CHANCE_SETTINGS_KEY = "__EF_PROC_CHANCE_SETTINGS__";
const PROC_CHANCE_FORCED_PERCENT = 100;
const PROC_CHANCE_RENDER_INTERVAL_MS = 250;
const BUFF_MANAGER_WRAPPED_MARKER = "__efProcChanceBuffManagerWrapped";
const HERO_UNIQUE_WRAPPED_MARKER = "__efProcChanceHeroUniqueWrapped";
const FAIRY_SKILL_SKIP_CODE = "elfsecret";
const PRIEST_SPEED_BUFF_CODE = "godbless";

function sanitizeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeGameplayCode(value) {
    return String(value || "").toLowerCase();
}

function readStoredSettings() {
    try {
        const raw = window.localStorage.getItem(PROC_CHANCE_SETTINGS_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeStoredSettings(settings) {
    try {
        window.localStorage.setItem(PROC_CHANCE_SETTINGS_KEY, JSON.stringify({
            version: 1,
            ...settings
        }));
    } catch (error) {
        // Storage is optional.
    }
}

function isBuffManager(candidate) {
    return candidate
        && typeof candidate === "object"
        && candidate.perSourceGameplay instanceof Map
        && candidate.gameplayMultiplierCache instanceof Map
        && candidate.sources instanceof Map
        && typeof candidate.getGameplayTotal === "function"
        && typeof candidate.getGameplayMultiplier === "function"
        && typeof candidate.recalculate === "function";
}

function isHeroUniqueSkillDataManager(candidate) {
    return candidate
        && typeof candidate === "object"
        && candidate.totals instanceof Map
        && candidate.bookMap instanceof Map
        && typeof candidate.getTotal === "function"
        && typeof candidate.normalizeCode === "function"
        && typeof candidate.recalculate === "function";
}

function forceAtLeastPercent(value, enabled) {
    const parsed = sanitizeNumber(value);
    if (!enabled) {
        return Number.isFinite(parsed) ? parsed : value;
    }
    return Number.isFinite(parsed)
        ? Math.max(PROC_CHANCE_FORCED_PERCENT, parsed)
        : PROC_CHANCE_FORCED_PERCENT;
}

function installBuffManagerObserver(onCandidate) {
    return installObjectPropertyCandidateDetector(["perSourceGameplay", "gameplayMultiplierCache", "sources"], (candidate) => {
        if (!isBuffManager(candidate)) {
            return;
        }
        try {
            onCandidate(candidate);
        } catch (error) {
            // Proc chance detection should not affect game runtime.
        }
    });
}

function installHeroUniqueSkillObserver(onCandidate) {
    return installObjectPropertyCandidateDetector(["totals", "contributorsMap", "contributorsDetailMap"], (candidate) => {
        if (!isHeroUniqueSkillDataManager(candidate)) {
            return;
        }
        try {
            onCandidate(candidate);
        } catch (error) {
            // Proc chance detection should not affect game runtime.
        }
    });
}

export function attachProcChance({ scanWarnMs = 15000, scanHardTimeoutMs = null } = {}) {
    const overlay = createProcChanceOverlay();
    const storedSettings = readStoredSettings();

    let uninstallBuffManagerObserver = null;
    let uninstallHeroUniqueSkillObserver = null;
    let buffManagerDetachHook = null;
    let heroUniqueDetachHook = null;
    let warnTimeoutId = null;
    let hardTimeoutId = null;
    let renderIntervalId = null;
    let attached = true;
    let buffManager = null;
    let heroUniqueSkillDataManager = null;
    let fairySkillSkipEnabled = storedSettings.fairySkillSkipEnabled !== false;
    let priestSpeedBuffEnabled = storedSettings.priestSpeedBuffEnabled !== false;

    const liveState = {
        status: "scanning",
        buffManagerDetected: false,
        heroUniqueSkillDetected: false,
        fairySkillSkipEnabled,
        priestSpeedBuffEnabled,
        fairySkillSkipValue: PROC_CHANCE_FORCED_PERCENT,
        priestSpeedBuffValue: PROC_CHANCE_FORCED_PERCENT
    };

    window.__EF_PROC_CHANCE_STATE__ = liveState;
    window.__EF_PROC_CHANCE_DEBUG__ = {
        buffManagerKeys: [],
        heroUniqueSkillKeys: [],
        lastForced: []
    };

    function persistSettings() {
        writeStoredSettings({
            fairySkillSkipEnabled,
            priestSpeedBuffEnabled
        });
    }

    function recordForced(code, originalValue, forcedValue, source) {
        try {
            const log = Array.isArray(window.__EF_PROC_CHANCE_DEBUG__.lastForced)
                ? window.__EF_PROC_CHANCE_DEBUG__.lastForced
                : [];
            log.push({
                at: new Date().toISOString(),
                code,
                originalValue,
                forcedValue,
                source
            });
            while (log.length > 20) {
                log.shift();
            }
            window.__EF_PROC_CHANCE_DEBUG__.lastForced = log;
        } catch (error) {
            // Debug state should never affect gameplay.
        }
    }

    function completeScanningIfReady() {
        const live = liveState.buffManagerDetected && liveState.heroUniqueSkillDetected;
        if (!live) {
            return;
        }
        liveState.status = "live";
        if (warnTimeoutId !== null) {
            window.clearTimeout(warnTimeoutId);
            warnTimeoutId = null;
        }
        if (hardTimeoutId !== null) {
            window.clearTimeout(hardTimeoutId);
            hardTimeoutId = null;
        }
    }

    function readFairySkillSkipValue() {
        if (!isBuffManager(buffManager)) {
            return fairySkillSkipEnabled ? PROC_CHANCE_FORCED_PERCENT : NaN;
        }
        try {
            const value = buffManager.getGameplayTotal(FAIRY_SKILL_SKIP_CODE);
            return forceAtLeastPercent(value, fairySkillSkipEnabled);
        } catch (error) {
            return fairySkillSkipEnabled ? PROC_CHANCE_FORCED_PERCENT : NaN;
        }
    }

    function readPriestSpeedBuffValue() {
        if (!isHeroUniqueSkillDataManager(heroUniqueSkillDataManager)) {
            return priestSpeedBuffEnabled ? PROC_CHANCE_FORCED_PERCENT : NaN;
        }
        try {
            const value = heroUniqueSkillDataManager.getTotal(PRIEST_SPEED_BUFF_CODE);
            return forceAtLeastPercent(value, priestSpeedBuffEnabled);
        } catch (error) {
            return priestSpeedBuffEnabled ? PROC_CHANCE_FORCED_PERCENT : NaN;
        }
    }

    function render() {
        if (!attached) {
            return;
        }
        liveState.fairySkillSkipEnabled = fairySkillSkipEnabled;
        liveState.priestSpeedBuffEnabled = priestSpeedBuffEnabled;
        liveState.fairySkillSkipValue = readFairySkillSkipValue();
        liveState.priestSpeedBuffValue = readPriestSpeedBuffValue();
        overlay.setState({ ...liveState });
    }

    function setProcEnabled(kind, enabled) {
        if (kind === "fairy") {
            fairySkillSkipEnabled = !!enabled;
        } else if (kind === "priest") {
            priestSpeedBuffEnabled = !!enabled;
        } else {
            return;
        }
        persistSettings();
        render();
    }

    function wrapBuffManager(candidate) {
        if (!isBuffManager(candidate)) {
            return;
        }
        buffManager = candidate;
        liveState.buffManagerDetected = true;
        window.__EF_PROC_CHANCE_DEBUG__.buffManagerKeys = Object.keys(candidate).slice(0, 80);

        const original = candidate.getGameplayTotal;
        if (typeof original === "function" && !original[BUFF_MANAGER_WRAPPED_MARKER]) {
            const wrapped = function wrappedProcChanceGetGameplayTotal(code, ...args) {
                const originalValue = original.call(this, code, ...args);
                if (normalizeGameplayCode(code) !== FAIRY_SKILL_SKIP_CODE) {
                    return originalValue;
                }
                const forcedValue = forceAtLeastPercent(originalValue, fairySkillSkipEnabled);
                if (forcedValue !== originalValue) {
                    recordForced(FAIRY_SKILL_SKIP_CODE, originalValue, forcedValue, "BuffManager");
                }
                return forcedValue;
            };
            wrapped[BUFF_MANAGER_WRAPPED_MARKER] = true;
            candidate.getGameplayTotal = wrapped;
            buffManagerDetachHook = () => {
                if (candidate.getGameplayTotal === wrapped) {
                    candidate.getGameplayTotal = original;
                }
            };
        }

        completeScanningIfReady();
        render();
    }

    function wrapHeroUniqueSkillDataManager(candidate) {
        if (!isHeroUniqueSkillDataManager(candidate)) {
            return;
        }
        heroUniqueSkillDataManager = candidate;
        liveState.heroUniqueSkillDetected = true;
        window.__EF_PROC_CHANCE_DEBUG__.heroUniqueSkillKeys = Object.keys(candidate).slice(0, 80);

        const original = candidate.getTotal;
        if (typeof original === "function" && !original[HERO_UNIQUE_WRAPPED_MARKER]) {
            const wrapped = function wrappedProcChanceGetHeroUniqueTotal(code, ...args) {
                const originalValue = original.call(this, code, ...args);
                if (normalizeGameplayCode(code) !== PRIEST_SPEED_BUFF_CODE) {
                    return originalValue;
                }
                const forcedValue = forceAtLeastPercent(originalValue, priestSpeedBuffEnabled);
                if (forcedValue !== originalValue) {
                    recordForced(PRIEST_SPEED_BUFF_CODE, originalValue, forcedValue, "HeroUniqueSkillDataManager");
                }
                return forcedValue;
            };
            wrapped[HERO_UNIQUE_WRAPPED_MARKER] = true;
            candidate.getTotal = wrapped;
            heroUniqueDetachHook = () => {
                if (candidate.getTotal === wrapped) {
                    candidate.getTotal = original;
                }
            };
        }

        completeScanningIfReady();
        render();
    }

    overlay.setState({ ...liveState });
    overlay.onToggle((kind, enabled) => {
        setProcEnabled(kind, enabled);
    });

    try {
        uninstallBuffManagerObserver = installBuffManagerObserver(wrapBuffManager);
        uninstallHeroUniqueSkillObserver = installHeroUniqueSkillObserver(wrapHeroUniqueSkillDataManager);
    } catch (error) {
        overlay.setError("Detector install failed");
        console.warn("[ef-proc-chance] detector install failed:", error);
        return { detach() {} };
    }

    renderIntervalId = window.setInterval(render, PROC_CHANCE_RENDER_INTERVAL_MS);

    warnTimeoutId = window.setTimeout(() => {
        if (!attached || liveState.status === "live") {
            return;
        }
        liveState.status = "slow";
        overlay.setError("Still waiting...");
    }, scanWarnMs);

    if (Number.isFinite(scanHardTimeoutMs) && scanHardTimeoutMs > 0) {
        hardTimeoutId = window.setTimeout(() => {
            if (liveState.status !== "live") {
                liveState.status = "timeout";
                overlay.setError("State unavailable");
            }
        }, scanHardTimeoutMs);
    }

    return {
        detach() {
            if (!attached) {
                return;
            }
            attached = false;
            if (warnTimeoutId !== null) {
                window.clearTimeout(warnTimeoutId);
                warnTimeoutId = null;
            }
            if (hardTimeoutId !== null) {
                window.clearTimeout(hardTimeoutId);
                hardTimeoutId = null;
            }
            if (renderIntervalId !== null) {
                window.clearInterval(renderIntervalId);
                renderIntervalId = null;
            }
            if (typeof uninstallBuffManagerObserver === "function") {
                uninstallBuffManagerObserver();
                uninstallBuffManagerObserver = null;
            }
            if (typeof uninstallHeroUniqueSkillObserver === "function") {
                uninstallHeroUniqueSkillObserver();
                uninstallHeroUniqueSkillObserver = null;
            }
            if (typeof buffManagerDetachHook === "function") {
                buffManagerDetachHook();
                buffManagerDetachHook = null;
            }
            if (typeof heroUniqueDetachHook === "function") {
                heroUniqueDetachHook();
                heroUniqueDetachHook = null;
            }
            overlay.remove();
            liveState.status = "detached";
        }
    };
}
