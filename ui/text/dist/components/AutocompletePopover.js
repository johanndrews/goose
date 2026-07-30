import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { Box, Text } from "ink";
import { emptyLine } from "./ContentRenderers.js";
import { Spinner } from "./Spinner.js";
import { CRANBERRY, GOLD, TEXT_DIM, TEXT_PRIMARY } from "../colors.js";
const CURSOR_WIDTH = 2;
const NAME_GAP = 2;
// Always returns exactly `rows` entries so the popover height never jumps
// between keystrokes; "more" indicators consume a row rather than adding one.
function buildDisplayRows(items, highlightedIndex, rows) {
    if (rows <= 0)
        return [];
    if (items.length === 0) {
        return Array.from({ length: rows }, () => ({ type: "empty" }));
    }
    // Reserving a slot for an indicator shrinks the window, which can only
    // hide more items — never fewer — so this can only need to *add* the other
    // indicator, never remove one. Two indicators means at most three passes
    // to settle: 0 -> 1 -> 2 shown, then a final pass to confirm no change.
    let showUp = false;
    let showDown = false;
    let start = 0;
    let end = 0;
    for (let pass = 0; pass < 3; pass++) {
        const slots = Math.max(rows - (showUp ? 1 : 0) - (showDown ? 1 : 0), 0);
        start = Math.min(Math.max(0, items.length - slots), Math.max(0, highlightedIndex - Math.floor(slots / 2)));
        end = Math.min(items.length, start + slots);
        const nextShowUp = start > 0;
        const nextShowDown = end < items.length;
        if (nextShowUp === showUp && nextShowDown === showDown)
            break;
        showUp = nextShowUp;
        showDown = nextShowDown;
    }
    const out = [];
    if (showUp)
        out.push({ type: "more", direction: "up", count: start });
    for (let i = start; i < end; i++) {
        out.push({ type: "entry", entry: items[i], index: i });
    }
    if (showDown) {
        out.push({ type: "more", direction: "down", count: items.length - end });
    }
    while (out.length < rows)
        out.push({ type: "empty" });
    return out;
}
export const AutocompletePopover = React.memo(function AutocompletePopover({ width, visibleRows, items, highlightedIndex, loading, errored, emptyLabel, }) {
    const rows = Math.max(visibleRows, 0);
    if (rows === 0)
        return null;
    const safeWidth = Math.max(width, 20);
    // Size the name column to the longest entry, so even it keeps NAME_GAP
    // between itself and the descriptions, and cap it so long names cannot
    // squeeze the descriptions out.
    const longestName = items.reduce((max, e) => Math.max(max, e.name.length), 0);
    const nameWidth = Math.max(Math.min(longestName, Math.floor(safeWidth * 0.35)), 1);
    const descWidth = Math.max(safeWidth - CURSOR_WIDTH - nameWidth - NAME_GAP, 4);
    const display = buildDisplayRows(items, highlightedIndex, rows);
    return (_jsxs(Box, { flexDirection: "column", width: safeWidth, flexShrink: 0, children: [display.map((row, i) => {
                if (row.type === "more") {
                    return (_jsx(Box, { width: safeWidth, height: 1, justifyContent: "center", children: _jsxs(Text, { color: TEXT_DIM, wrap: "truncate-end", children: [row.direction === "up" ? "▲" : "▼", " ", row.count, " more"] }) }, `ac-more-${row.direction}`));
                }
                if (row.type === "empty") {
                    if (i === 0 && loading) {
                        return (_jsxs(Box, { width: safeWidth, height: 1, children: [_jsx(Spinner, { idx: 0 }), _jsxs(Text, { color: TEXT_DIM, wrap: "truncate-end", children: [" ", "loading\u2026"] })] }, "ac-loading"));
                    }
                    if (i === 0 && errored) {
                        return (_jsx(Box, { width: safeWidth, height: 1, children: _jsx(Text, { color: CRANBERRY, wrap: "truncate-end", children: "couldn't load suggestions" }) }, "ac-error"));
                    }
                    if (i === 0 && items.length === 0) {
                        return (_jsx(Box, { width: safeWidth, height: 1, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate-end", children: emptyLabel }) }, "ac-empty"));
                    }
                    return emptyLine(`ac-pad-${i}`, safeWidth);
                }
                const active = row.index === highlightedIndex;
                return (_jsxs(Box, { width: safeWidth, children: [_jsx(Text, { color: active ? GOLD : TEXT_DIM, children: active ? "▸ " : "  " }), _jsx(Box, { width: nameWidth, marginRight: NAME_GAP, children: _jsx(Text, { color: active ? TEXT_PRIMARY : TEXT_DIM, bold: active, wrap: "truncate-end", children: row.entry.name }) }), _jsx(Box, { width: descWidth, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate-end", children: row.entry.description }) })] }, `ac-${row.entry.name}`));
            }), _jsx(Box, { width: safeWidth, height: 1, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate-end", children: "\u2191\u2193 navigate \u00B7 tab/enter \u00B7 esc close" }) })] }));
});
