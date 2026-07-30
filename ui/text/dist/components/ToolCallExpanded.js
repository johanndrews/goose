import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { formatJson, } from "../toolcall.js";
import { CRANBERRY, TEAL, GOLD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_DIM, } from "../colors.js";
import { SCROLL_STEP, SCROLL_FAST_MULTIPLIER } from "../constants.js";
const STATUS_COLORS = {
    pending: TEXT_DIM,
    in_progress: GOLD,
    completed: TEAL,
    failed: CRANBERRY,
};
function wrapOrTruncate(text, width) {
    const safeWidth = Math.max(width, 10);
    const out = [];
    for (const rawLine of text.split("\n")) {
        if (rawLine.length <= safeWidth) {
            out.push(rawLine);
            continue;
        }
        let remaining = rawLine;
        while (remaining.length > safeWidth) {
            out.push(remaining.slice(0, safeWidth));
            remaining = remaining.slice(safeWidth);
        }
        if (remaining.length > 0)
            out.push(remaining);
    }
    return out;
}
function extractContentText(content) {
    if (!content || content.length === 0)
        return "";
    const parts = [];
    for (const item of content) {
        if (item.type === "content") {
            const block = item.content;
            if (block.type === "text" && block.text) {
                parts.push(block.text);
            }
            else if (block.type === "resource_link") {
                parts.push(`🔗 ${block.uri}`);
            }
            else if (block.type === "image") {
                parts.push(`🖼  image (${block.mimeType ?? "unknown"})`);
            }
            else if (block.type === "audio") {
                parts.push(`🎵 audio (${block.mimeType ?? "unknown"})`);
            }
            else if (block.type === "resource") {
                const res = block.resource;
                if (res.text) {
                    parts.push(res.text);
                }
                else if (res.uri) {
                    parts.push(`📎 ${res.uri}`);
                }
            }
        }
        else if (item.type === "diff") {
            const header = `📝 diff: ${item.path}`;
            const old = item.oldText ?? "";
            parts.push([
                header,
                ...(old ? old.split("\n").map((l) => `- ${l}`) : []),
                ...item.newText.split("\n").map((l) => `+ ${l}`),
            ].join("\n"));
        }
        else if (item.type === "terminal") {
            parts.push(`▶ terminal: ${item.terminalId}`);
        }
    }
    return parts.join("\n\n");
}
function buildBody(info, contentWidth) {
    const body = [];
    const pushLabel = (label, keyPrefix, withTopGap) => {
        if (withTopGap) {
            body.push(_jsx(Box, { height: 1, children: _jsx(Text, { children: " " }) }, `${keyPrefix}-gap`));
        }
        body.push(_jsx(Box, { height: 1, children: _jsx(Text, { color: TEXT_SECONDARY, bold: true, children: label }) }, `${keyPrefix}-hdr`));
    };
    const pushText = (text, keyPrefix, emptyHint) => {
        if (!text) {
            body.push(_jsx(Box, { height: 1, children: _jsx(Text, { color: TEXT_DIM, italic: true, children: emptyHint }) }, `${keyPrefix}-empty`));
            return;
        }
        const lines = wrapOrTruncate(text, contentWidth);
        lines.forEach((l, i) => {
            body.push(_jsx(Box, { height: 1, children: _jsx(Text, { color: TEXT_PRIMARY, children: l || " " }) }, `${keyPrefix}-${i}`));
        });
    };
    pushLabel(info.title, "tool", false);
    pushLabel("arguments", "in", true);
    const argsText = formatJson(info.rawInput);
    pushText(argsText, "in", "(no arguments)");
    pushLabel("result", "out", true);
    let resultText = formatJson(info.rawOutput);
    if (!resultText) {
        resultText = extractContentText(info.content);
    }
    const resultEmptyHint = info.status === "in_progress"
        ? "(running…)"
        : info.status === "pending"
            ? "(pending)"
            : info.status === "failed"
                ? "(failed — no output)"
                : "(no output)";
    pushText(resultText, "out", resultEmptyHint);
    return body;
}
export function ToolCallExpanded({ info, width, height, scrollOffset, onScroll, onClose, }) {
    const safeWidth = Math.max(width, 20);
    const safeHeight = Math.max(height, 5);
    const contentWidth = Math.max(safeWidth - 4, 10);
    const allLines = useMemo(() => buildBody(info, contentWidth), [info, contentWidth]);
    useInput((ch, key) => {
        if (key.escape || ch === " ") {
            onClose();
            return;
        }
        if (key.upArrow || key.downArrow) {
            const step = key.meta
                ? SCROLL_STEP * SCROLL_FAST_MULTIPLIER
                : SCROLL_STEP;
            if (key.upArrow) {
                onScroll((prev) => prev + step);
            }
            else {
                onScroll((prev) => Math.max(prev - step, 0));
            }
        }
    });
    const headerH = 2;
    const footerH = 2;
    const bodyHeight = Math.max(safeHeight - headerH - footerH, 1);
    const total = allLines.length;
    const overflows = total > bodyHeight;
    const contentHeight = overflows ? Math.max(bodyHeight - 2, 1) : bodyHeight;
    const maxEnd = total;
    const minEnd = Math.min(contentHeight, total);
    const endIdx = Math.max(minEnd, Math.min(maxEnd - scrollOffset, maxEnd));
    const startIdx = Math.max(0, endIdx - contentHeight);
    const visible = allLines.slice(startIdx, endIdx);
    const padCount = contentHeight - visible.length;
    const elements = [];
    if (overflows) {
        const above = startIdx;
        elements.push(_jsx(Box, { width: safeWidth, height: 1, justifyContent: "center", children: above > 0 ? (_jsxs(Text, { color: TEXT_DIM, children: ["\u25B2 ", above, " more (\u2191)"] })) : (_jsx(Text, { children: " " })) }, "exp-up"));
    }
    for (let i = 0; i < padCount; i++) {
        elements.push(_jsx(Box, { width: safeWidth, height: 1, children: _jsx(Text, { children: " " }) }, `exp-pad-${i}`));
    }
    elements.push(...visible);
    if (overflows) {
        const below = total - endIdx;
        elements.push(_jsx(Box, { width: safeWidth, height: 1, justifyContent: "center", children: below > 0 ? (_jsxs(Text, { color: TEXT_DIM, children: ["\u25BC ", below, " more (\u2193)"] })) : (_jsx(Text, { children: " " })) }, "exp-dn"));
    }
    const statusColor = STATUS_COLORS[info.status] ?? TEXT_DIM;
    return (_jsxs(Box, { flexDirection: "column", width: safeWidth, height: safeHeight, borderStyle: "round", borderColor: GOLD, paddingX: 1, children: [_jsxs(Box, { width: contentWidth, height: 1, children: [_jsx(Text, { color: statusColor, children: "\u25CF" }), _jsxs(Text, { color: TEXT_DIM, children: [" ", info.status] }), _jsx(Box, { flexGrow: 1 }), _jsx(Text, { color: TEXT_DIM, italic: true, children: "space/esc to close" })] }), _jsx(Box, { flexDirection: "column", width: contentWidth, height: bodyHeight, children: elements }), _jsx(Box, { width: contentWidth, height: 1, children: _jsx(Text, { color: TEXT_DIM, children: "\u2191\u2193 scroll \u00B7 \u2325\u2191\u2193 fast" }) })] }));
}
