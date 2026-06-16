import { REMOTE_ORIGIN } from "../config.js";
import { installObjectPropertyCandidateDetector } from "../property-detector.js";
import { createGuildTrackerOverlay } from "./overlay.js";

const API_BASE = `${REMOTE_ORIGIN || "https://game.endlessfrontier.io"}/api`;
const GUILD_MANAGER_DETECTED_MARKER = "__efGuildTrackerDetected";
const RANK_LIST_LIMIT = 10000;

function sanitizeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function getNestedValue(source, paths) {
    for (const path of paths) {
        let current = source;
        let found = true;
        for (const key of path) {
            if (!current || typeof current !== "object" || !(key in current)) {
                found = false;
                break;
            }
            current = current[key];
        }
        if (found && current !== undefined && current !== null && current !== "") {
            return current;
        }
    }
    return undefined;
}

function normalizeMember(raw) {
    const memberId = getNestedValue(raw, [["memberId"], ["id"], ["_id"]]);
    const userName = getNestedValue(raw, [["userName"], ["name"], ["nickname"]]);
    const userId = getNestedValue(raw, [["userId"], ["uid"], ["uId"], ["user", "userId"], ["user", "uid"]]);
    return {
        memberId: memberId == null ? "" : String(memberId),
        userId: userId == null ? "" : String(userId),
        guildId: getNestedValue(raw, [["guildId"]]) || "",
        role: getNestedValue(raw, [["role"]]) || "",
        points: sanitizeNumber(getNestedValue(raw, [["points"]])),
        userName: userName == null ? "" : String(userName),
        wave: sanitizeNumber(getNestedValue(raw, [["wave"], ["user", "wave"]])),
        maxWave: sanitizeNumber(getNestedValue(raw, [["maxWave"], ["user", "maxWave"]])),
        medal: sanitizeNumber(getNestedValue(raw, [["medal"], ["user", "medal"]])),
        accuMedal: sanitizeNumber(getNestedValue(raw, [["accuMedal"], ["user", "accuMedal"]])),
        lastLoginTime: getNestedValue(raw, [["lastLoginTime"], ["user", "lastLoginTime"]]) || "",
        lastActiveAt: getNestedValue(raw, [["lastActiveAt"]]) || ""
    };
}

function isMeaningfulValue(value) {
    if (value === "" || value === null || value === undefined) {
        return false;
    }
    if (typeof value === "number") {
        return Number.isFinite(value);
    }
    return true;
}

function normalizeRankEntry(raw) {
    return {
        userName: raw.name == null ? "" : String(raw.name),
        maxWave: sanitizeNumber(raw.maxWave),
        accuWave: sanitizeNumber(raw.accuWave),
        accuMedal: sanitizeNumber(raw.accuMedal),
        rank: sanitizeNumber(raw.rank)
    };
}

function mergeRankData(base, rankEntry) {
    if (!rankEntry) {
        return base;
    }
    const rankData = Object.fromEntries(
        Object.entries(rankEntry).filter(([, value]) => isMeaningfulValue(value))
    );
    return { ...base, ...rankData };
}

function isGuildManager(candidate) {
    return candidate
        && (typeof candidate === "object" || typeof candidate === "function")
        && Array.isArray(candidate.memberList)
        && typeof candidate.setMemberData === "function"
        && Object.prototype.hasOwnProperty.call(candidate, "myGuildId");
}

function getRequestManager() {
    const manager = window.__EF_REQUEST_MANAGER__;
    return manager
        && typeof manager === "function"
        && typeof manager.encrypt === "function"
        && typeof manager.decrypt === "function"
        && typeof manager.setParams === "function"
        ? manager
        : null;
}

async function postGameApi(path, payload = {}) {
    const requestManager = getRequestManager();
    if (!requestManager) {
        throw new Error("Request manager unavailable");
    }

    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const requestPayload = { ...payload };
    requestManager.setParams(url, requestPayload);
    const encryptedPayload = await requestManager.encrypt(requestPayload, url);
    const headers = { "Content-Type": "application/json" };
    if (requestManager.connectSid) {
        headers["x-cookie"] = requestManager.connectSid;
    }

    const response = await window.fetch(url, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(encryptedPayload)
    });
    let responsePayload = await response.json();
    responsePayload = await requestManager.decrypt(responsePayload, url);
    if (typeof requestManager.processResponse === "function") {
        responsePayload = requestManager.processResponse(responsePayload, url, "POST");
    }
    responsePayload._ok_ = response.ok;
    responsePayload._status_ = response.status;
    return responsePayload;
}

function createLiveState() {
    return {
        status: "idle",
        statusText: "Idle",
        guildManagerDetected: false,
        requestManagerDetected: false,
        guildId: "",
        rows: [],
        lastScanAt: null,
        error: "",
        progress: { current: 0, total: 0 },
        emptyText: "No scan yet"
    };
}

export function attachGuildTracker({ scanWarnMs = 15000 } = {}) {
    const overlay = createGuildTrackerOverlay();
    const liveState = createLiveState();
    let attached = true;
    let scanning = false;
    let guildManager = null;
    let warnTimeoutId = null;
    let uninstallGuildManagerObserver = null;

    window.__EF_GUILD_TRACKER_STATE__ = liveState;
    window.__EF_GUILD_TRACKER_LOG__ = [];

    function publish() {
        liveState.guildManagerDetected = isGuildManager(guildManager);
        liveState.requestManagerDetected = !!getRequestManager();
        overlay.setState({ ...liveState, rows: liveState.rows.slice() });
    }

    function record(detail) {
        try {
            const entry = {
                at: new Date().toISOString(),
                ...detail
            };
            window.__EF_GUILD_TRACKER_LOG__.push(entry);
            while (window.__EF_GUILD_TRACKER_LOG__.length > 100) {
                window.__EF_GUILD_TRACKER_LOG__.shift();
            }
        } catch (error) {
            // Diagnostics should not affect the game.
        }
    }

    function setStatus(status, statusText) {
        liveState.status = status;
        liveState.statusText = statusText;
        publish();
    }

    function detectGuildManager(candidate) {
        if (!isGuildManager(candidate) || candidate[GUILD_MANAGER_DETECTED_MARKER]) {
            return;
        }
        candidate[GUILD_MANAGER_DETECTED_MARKER] = true;
        guildManager = candidate;
        window.__EF_GUILD_MANAGER__ = candidate;
        publish();
    }

    function readGuildId() {
        const direct = guildManager?.myGuildId || window.__EF_GUILD_TRACKER_GUILD_ID__;
        return direct == null ? "" : String(direct);
    }

    async function resolveGuildId() {
        const direct = readGuildId();
        if (direct) {
            return direct;
        }
        const membership = await postGameApi("/guild/getMyMembership", {});
        const guildId = getNestedValue(membership, [["body", "membership", "guildId"], ["membership", "guildId"]]);
        if (guildId) {
            return String(guildId);
        }
        const brief = await postGameApi("/guild/getBriefInfo", {});
        const briefGuildId = getNestedValue(brief, [["body", "membership", "guildId"], ["body", "guild", "guildId"]]);
        return briefGuildId == null ? "" : String(briefGuildId);
    }

    async function fetchRankList(guildId) {
        try {
            const response = await postGameApi("/user/getRankList", {
                type: "maxWave",
                limit: RANK_LIST_LIMIT
            });
            const rankList = getNestedValue(response, [
                ["body", "rankList"],
                ["rankList"]
            ]);
            return Array.isArray(rankList) ? rankList : [];
        } catch (error) {
            record({ type: "rank-list-error", guildId, error: String(error?.message || error) });
            return [];
        }
    }

    async function scanNow() {
        if (!attached || scanning) {
            return liveState;
        }
        scanning = true;
        liveState.error = "";
        liveState.rows = [];
        liveState.emptyText = "Scanning...";
        setStatus("scanning", "Finding guild...");

        try {
            const guildId = await resolveGuildId();
            if (!guildId) {
                throw new Error("No guild id available");
            }
            liveState.guildId = guildId;
            setStatus("scanning", "Loading members...");

            const [memberResponse, rankListRaw] = await Promise.all([
                postGameApi("/guild/getMembers", { guildId }),
                fetchRankList(guildId)
            ]);

            const members = memberResponse?.body?.members || memberResponse?.members || [];
            if (!Array.isArray(members)) {
                throw new Error("Member response did not include a members array");
            }

            const rankByName = new Map();
            for (const entry of rankListRaw) {
                const normalized = normalizeRankEntry(entry);
                if (normalized.userName) {
                    rankByName.set(normalized.userName, normalized);
                }
            }

            const baseRows = members.map(normalizeMember);
            liveState.rows = baseRows;
            liveState.progress = { current: baseRows.length, total: baseRows.length };
            setStatus("scanning", "Merging rank data...");

            const enrichedRows = baseRows.map(base => {
                const rankEntry = rankByName.get(base.userName) || null;
                return mergeRankData(base, rankEntry);
            });

            liveState.rows = enrichedRows;
            liveState.lastScanAt = new Date().toISOString();
            liveState.emptyText = "No members found";
            setStatus("idle", `Done: ${liveState.rows.length} members`);
            record({ type: "scan-complete", guildId, count: liveState.rows.length });
        } catch (error) {
            liveState.error = String(error?.message || error);
            liveState.emptyText = liveState.error;
            setStatus("error", `Error: ${liveState.error}`);
            record({ type: "scan-error", error: liveState.error });
        } finally {
            scanning = false;
            publish();
        }
        return liveState;
    }

    overlay.onScan(() => {
        scanNow();
    });

    try {
        uninstallGuildManagerObserver = installObjectPropertyCandidateDetector(["myGuildId", "memberList", "objMember"], detectGuildManager);
    } catch (error) {
        liveState.error = String(error?.message || error);
        setStatus("error", "Detector failed");
    }

    warnTimeoutId = window.setTimeout(() => {
        if (attached && !isGuildManager(guildManager)) {
            setStatus("idle", "Idle: waiting for guild");
        }
    }, scanWarnMs);

    publish();
    window.__EF_GUILD_TRACKER_SCAN__ = scanNow;

    return {
        scanNow,
        detach() {
            if (!attached) {
                return;
            }
            attached = false;
            if (warnTimeoutId !== null) {
                window.clearTimeout(warnTimeoutId);
                warnTimeoutId = null;
            }
            if (typeof uninstallGuildManagerObserver === "function") {
                uninstallGuildManagerObserver();
                uninstallGuildManagerObserver = null;
            }
            overlay.remove();
            liveState.status = "detached";
            liveState.statusText = "Detached";
        }
    };
}
