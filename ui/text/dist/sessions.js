const UNTITLED_SESSION = "untitled session";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
function metaValue(info, key) {
    return info._meta?.[key];
}
function toResumableSession(info) {
    const messageCount = metaValue(info, "messageCount");
    const snippet = metaValue(info, "lastMessageSnippet");
    return {
        id: info.sessionId,
        title: info.title?.trim() || UNTITLED_SESSION,
        updatedAt: info.updatedAt ? new Date(info.updatedAt) : null,
        messageCount: typeof messageCount === "number" ? messageCount : 0,
        snippet: typeof snippet === "string" ? snippet : "",
    };
}
/**
 * Sessions started in `cwd`, newest first — the agent sorts by last activity,
 * which is the order a resume picker wants.
 */
export async function listResumableSessions(client, cwd) {
    const response = await client.listSessions({
        cwd,
        _meta: { goose: { includeLastMessageSnippet: true } },
    });
    return response.sessions.map(toResumableSession);
}
export function formatSessionAge(updatedAt, now) {
    if (!updatedAt)
        return "";
    const elapsed = now.getTime() - updatedAt.getTime();
    if (elapsed < MINUTE_MS)
        return "just now";
    if (elapsed < HOUR_MS)
        return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
    if (elapsed < DAY_MS)
        return `${Math.floor(elapsed / HOUR_MS)}h ago`;
    return `${Math.floor(elapsed / DAY_MS)}d ago`;
}
