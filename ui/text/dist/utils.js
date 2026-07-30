import os from "node:os";
import path from "node:path";
const SHORTEN_PATH_MAX_LEN = 60;
const SHORTEN_PATH_MAX_PARTS = 3;
/**
 * Ink does not clip overflow, so text has to fit its box before it is rendered:
 * collapse the whitespace that would add lines, then cut to the column budget.
 */
export function fitToWidth(text, width) {
    if (width <= 0)
        return "";
    const flat = text.replace(/\s+/g, " ").trim();
    if (flat.length <= width)
        return flat;
    return `${flat.slice(0, Math.max(width - 1, 0))}…`;
}
export function isErrorStatus(status) {
    return status.startsWith("error") || status.startsWith("failed");
}
// Separators come from node:path so this also works on Windows, where the
// launcher (scripts/dev-start.mjs) supports goose.exe and paths use backslashes.
export function shortenPath(target) {
    const home = os.homedir();
    const sep = path.sep;
    // A directory name may legally contain newlines or escape sequences. Left in,
    // they would break the single-row layout or drive the terminal, so drop them
    // the way the CLI does for the window title (session/output.rs).
    const normalized = path.normalize(target).replace(/\p{Cc}/gu, "");
    const withTilde = normalized === home
        ? "~"
        : normalized.startsWith(`${home}${sep}`)
            ? `~${normalized.slice(home.length)}`
            : normalized;
    if (withTilde.length <= SHORTEN_PATH_MAX_LEN)
        return withTilde;
    // Split off the root first — a Windows UNC path ("\\\\server\\share\\") is two
    // empty leading segments, and abbreviating those would name a different host.
    const root = path.parse(withTilde).root;
    const parts = withTilde.slice(root.length).split(sep).filter(Boolean);
    if (parts.length <= SHORTEN_PATH_MAX_PARTS)
        return withTilde;
    const shortened = [parts[0]];
    for (const part of parts.slice(1, -2)) {
        // Take the first code point, not the first UTF-16 unit: a directory name
        // starting with an emoji would otherwise leave half a surrogate pair.
        shortened.push([...part][0]);
    }
    shortened.push(...parts.slice(-2));
    return root + shortened.join(sep);
}
export function formatError(e) {
    if (e instanceof Error) {
        return e.message || e.toString();
    }
    if (typeof e === "string") {
        return e;
    }
    if (e && typeof e === "object") {
        try {
            return JSON.stringify(e, null, 2);
        }
        catch {
            return String(e);
        }
    }
    return String(e);
}
