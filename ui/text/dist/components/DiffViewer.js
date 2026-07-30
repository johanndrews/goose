import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { TEXT_DIM, TEXT_PRIMARY, GOLD, TEAL, CRANBERRY, TEXT_SECONDARY, } from "../colors.js";
import { SCROLL_FAST_MULTIPLIER } from "../constants.js";
const PAD_X = 2;
const PAD_Y = 1;
const HEADER_LINES = 1;
const FOOTER_LINES = 1;
function classifyLine(line) {
    if (line.startsWith("+++") || line.startsWith("---"))
        return "meta";
    if (line.startsWith("diff ") ||
        line.startsWith("index ") ||
        line.startsWith("new file") ||
        line.startsWith("deleted file") ||
        line.startsWith("rename ") ||
        line.startsWith("similarity ") ||
        line.startsWith("Binary ")) {
        return "meta";
    }
    if (line.startsWith("@@"))
        return "hunk";
    if (line.startsWith("+"))
        return "add";
    if (line.startsWith("-"))
        return "remove";
    return "context";
}
function padLine(line, width) {
    if (line.length >= width)
        return line.slice(0, width);
    return line + " ".repeat(width - line.length);
}
export function DiffViewer({ content, truncated, width, height, onClose, }) {
    const lines = useMemo(() => {
        const split = content.split("\n");
        if (split.length > 0 && split[split.length - 1] === "")
            split.pop();
        return split;
    }, [content]);
    const innerWidth = Math.max(width - PAD_X * 2, 10);
    const innerHeight = Math.max(height - PAD_Y * 2, 3);
    const viewportHeight = Math.max(innerHeight - HEADER_LINES - FOOTER_LINES, 1);
    const maxScroll = Math.max(lines.length - viewportHeight, 0);
    const [scroll, setScroll] = useState(0);
    useEffect(() => {
        setScroll((prev) => Math.min(prev, maxScroll));
    }, [maxScroll]);
    useInput((ch, key) => {
        if (ch === "q" || ch === "Q" || key.escape) {
            onClose();
            return;
        }
        if (key.ctrl && (ch === "c" || ch === "C")) {
            onClose();
            return;
        }
        if (key.downArrow || ch === "j") {
            const step = key.meta ? SCROLL_FAST_MULTIPLIER : 1;
            setScroll((s) => Math.min(s + step, maxScroll));
            return;
        }
        if (key.upArrow || ch === "k") {
            const step = key.meta ? SCROLL_FAST_MULTIPLIER : 1;
            setScroll((s) => Math.max(s - step, 0));
            return;
        }
        if (key.pageDown || ch === " " || (key.ctrl && ch === "d")) {
            setScroll((s) => Math.min(s + viewportHeight, maxScroll));
            return;
        }
        if (key.pageUp || ch === "b" || (key.ctrl && ch === "u")) {
            setScroll((s) => Math.max(s - viewportHeight, 0));
            return;
        }
        if (ch === "g") {
            setScroll(0);
            return;
        }
        if (ch === "G") {
            setScroll(maxScroll);
            return;
        }
    });
    const visible = lines.slice(scroll, scroll + viewportHeight);
    const atEnd = scroll >= maxScroll;
    const atStart = scroll === 0;
    const position = maxScroll === 0
        ? "ALL"
        : atEnd
            ? "END"
            : `${Math.round((scroll / maxScroll) * 100)}%`;
    return (_jsxs(Box, { flexDirection: "column", width: width, height: height, paddingX: PAD_X, paddingY: PAD_Y, children: [_jsxs(Box, { width: innerWidth, justifyContent: "space-between", flexShrink: 0, children: [_jsxs(Text, { color: TEXT_PRIMARY, bold: true, children: ["git diff", truncated ? " (truncated)" : ""] }), _jsxs(Text, { color: TEXT_DIM, children: [atStart ? "" : "↑ ", "lines ", scroll + 1, "\u2013", Math.min(scroll + viewportHeight, lines.length), " / ", lines.length, " ", "[", position, "]"] })] }), _jsx(Box, { flexDirection: "column", width: innerWidth, height: viewportHeight, children: visible.map((line, i) => {
                    const kind = classifyLine(line);
                    const padded = padLine(line, innerWidth);
                    switch (kind) {
                        case "add":
                            return (_jsx(Text, { wrap: "truncate-end", color: TEXT_PRIMARY, backgroundColor: TEAL, children: padded }, i));
                        case "remove":
                            return (_jsx(Text, { wrap: "truncate-end", color: TEXT_PRIMARY, backgroundColor: CRANBERRY, children: padded }, i));
                        case "hunk":
                            return (_jsx(Text, { wrap: "truncate-end", color: GOLD, bold: true, children: padded }, i));
                        case "meta":
                            return (_jsx(Text, { wrap: "truncate-end", color: TEXT_SECONDARY, bold: true, children: padded }, i));
                        default:
                            return (_jsx(Text, { wrap: "truncate-end", color: TEXT_PRIMARY, children: padded }, i));
                    }
                }) }), _jsxs(Box, { width: innerWidth, flexShrink: 0, children: [_jsx(Text, { color: GOLD, children: "q" }), _jsx(Text, { color: TEXT_DIM, children: " close \u00B7 " }), _jsx(Text, { color: GOLD, children: "\u2191\u2193" }), _jsx(Text, { color: TEXT_DIM, children: "/" }), _jsx(Text, { color: GOLD, children: "j k" }), _jsx(Text, { color: TEXT_DIM, children: " scroll \u00B7 " }), _jsx(Text, { color: GOLD, children: "space" }), _jsx(Text, { color: TEXT_DIM, children: "/" }), _jsx(Text, { color: GOLD, children: "b" }), _jsx(Text, { color: TEXT_DIM, children: " page \u00B7 " }), _jsx(Text, { color: GOLD, children: "g" }), _jsx(Text, { color: TEXT_DIM, children: "/" }), _jsx(Text, { color: GOLD, children: "G" }), _jsx(Text, { color: TEXT_DIM, children: " top/bottom" })] })] }));
}
