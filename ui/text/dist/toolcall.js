import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { CRANBERRY, TEAL, GOLD, TEXT_SECONDARY, TEXT_DIM } from "./colors.js";
const CEDAR = "#6B5344";
const KIND_ICONS = {
    read: "📖",
    edit: "✏️",
    delete: "🗑",
    move: "📦",
    search: "🔍",
    execute: "▶",
    think: "💭",
    fetch: "🌐",
    switch_mode: "🔀",
    other: "⚙",
};
const STATUS_INDICATORS = {
    pending: { icon: "○", color: TEXT_DIM },
    in_progress: { icon: "◑", color: GOLD },
    completed: { icon: "●", color: TEAL },
    failed: { icon: "✗", color: CRANBERRY },
};
function truncateLine(line, maxWidth) {
    const safeMaxWidth = Math.max(maxWidth, 1);
    if (line.length <= safeMaxWidth)
        return line;
    return safeMaxWidth > 1
        ? line.slice(0, safeMaxWidth - 1) + "…"
        : line.slice(0, safeMaxWidth);
}
export function formatJson(value) {
    if (value === undefined || value === null)
        return "";
    if (typeof value === "string") {
        // If it looks like JSON, try to parse and re-format; otherwise return as-is.
        const trimmed = value.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                return JSON.stringify(JSON.parse(trimmed), null, 2);
            }
            catch {
                return value;
            }
        }
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
/**
 * Render a tool call as a single-line boxed summary.
 *
 * The box always has the same content and height as before; when `selected`
 * is true we swap the border color and show a hint that space will expand it.
 */
export function renderToolCallLines(info, width, selected) {
    const kindIcon = KIND_ICONS[info.kind ?? "other"] ?? "⚙";
    const statusInfo = STATUS_INDICATORS[info.status] ?? STATUS_INDICATORS.pending;
    const borderColor = selected
        ? GOLD
        : info.status === "failed"
            ? CRANBERRY
            : CEDAR;
    const dimBorder = !selected && info.status !== "failed";
    const safeWidth = Math.max(width, 10);
    const innerWidth = Math.max(safeWidth - 4, 6);
    const k = info.toolCallId;
    const lines = [];
    const hRule = "─".repeat(Math.max(safeWidth - 2, 0));
    lines.push(_jsx(Box, { width: safeWidth, height: 1, children: _jsxs(Text, { color: borderColor, dimColor: dimBorder, children: ["\u256D", hRule, "\u256E"] }) }, `${k}-t`));
    const statusIcon = statusInfo.icon;
    const runningText = info.status === "in_progress" ? " running…" : "";
    const hintText = selected ? "space to expand" : "";
    const fixedLen = 4 + runningText.length + hintText.length;
    const titleMax = Math.max(innerWidth - fixedLen, 4);
    const title = truncateLine(info.title, titleMax);
    lines.push(_jsxs(Box, { width: safeWidth, height: 1, children: [_jsxs(Text, { color: borderColor, dimColor: dimBorder, children: ["\u2502", " "] }), _jsxs(Box, { width: innerWidth, height: 1, children: [_jsx(Text, { color: statusInfo.color, children: statusIcon }), _jsxs(Text, { children: [" ", kindIcon, " "] }), _jsx(Text, { wrap: "truncate-end", color: TEXT_SECONDARY, bold: true, children: title }), runningText ? (_jsx(Text, { color: TEXT_DIM, italic: true, children: runningText })) : null, _jsx(Box, { flexGrow: 1 }), hintText ? (_jsx(Text, { color: GOLD, italic: true, children: hintText })) : null] }), _jsxs(Text, { color: borderColor, dimColor: dimBorder, children: [" ", "\u2502"] })] }, `${k}-h`));
    lines.push(_jsx(Box, { width: safeWidth, height: 1, children: _jsxs(Text, { color: borderColor, dimColor: dimBorder, children: ["\u2570", hRule, "\u256F"] }) }, `${k}-b`));
    return lines;
}
/**
 * Height in lines of the rendered single-line tool-call box.
 * Kept in sync with `renderToolCallLines`.
 */
export const TOOL_CALL_BOX_HEIGHT = 3;
