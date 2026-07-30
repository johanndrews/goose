import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Rule } from "./Rule.js";
import { formatSessionAge } from "../sessions.js";
import { fitToWidth } from "../utils.js";
import { GOLD, TEAL, TEXT_PRIMARY, TEXT_DIM } from "../colors.js";
// Each session occupies its title line plus the snippet line below it.
const ROWS_PER_SESSION = 2;
// Header, two rules, footer, and one scroll hint above and below the list.
const CHROME_ROWS = 6;
const PAD_X = 2;
const MARKER_WIDTH = 2;
const COLUMN_GAP = 2;
const SNIPPET_INDENT = 4;
// Widest meta column we render: "just now · 9999 msgs".
const META_WIDTH = 21;
const MIN_TEXT_WIDTH = 10;
const HEADING = "Resume a session";
function sessionMeta(session, now) {
    const count = `${session.messageCount} ${session.messageCount === 1 ? "msg" : "msgs"}`;
    const age = formatSessionAge(session.updatedAt, now);
    return age ? `${age} · ${count}` : count;
}
// Narrow terminals get the shorter wording rather than a cut-off long one.
function hintForWidth(long, short, width) {
    return fitToWidth(long.length <= width ? long : short, width);
}
export const SessionPicker = React.memo(function SessionPicker({ sessions, cwd, width, height, escapeAction, onSelect, onCancel, }) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [scrollOffset, setScrollOffset] = useState(0);
    const visibleCount = Math.max(Math.floor((height - CHROME_ROWS) / ROWS_PER_SESSION), 1);
    useEffect(() => {
        if (selectedIdx < scrollOffset) {
            setScrollOffset(selectedIdx);
        }
        else if (selectedIdx >= scrollOffset + visibleCount) {
            setScrollOffset(selectedIdx - visibleCount + 1);
        }
    }, [selectedIdx, scrollOffset, visibleCount]);
    useInput((_ch, key) => {
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.upArrow) {
            setSelectedIdx((i) => Math.max(i - 1, 0));
            return;
        }
        if (key.downArrow) {
            setSelectedIdx((i) => Math.min(i + 1, sessions.length - 1));
            return;
        }
        if (key.return) {
            const session = sessions[selectedIdx];
            if (session)
                onSelect(session);
            else
                onCancel();
        }
    });
    const contentWidth = Math.max(width - PAD_X * 2, MIN_TEXT_WIDTH);
    // Marker, title, gap and meta together must equal contentWidth exactly: Ink
    // does not clip, so a column that does not fit pushes the row onto the next
    // line — and a column with no gap runs into its neighbour.
    const metaWidth = Math.min(META_WIDTH, Math.max(contentWidth - MARKER_WIDTH - COLUMN_GAP - MIN_TEXT_WIDTH, 0));
    const titleWidth = Math.max(contentWidth - MARKER_WIDTH - COLUMN_GAP - metaWidth, 0);
    // The snippet is quoted, so it loses two more columns to the quote marks.
    const snippetWidth = Math.max(contentWidth - SNIPPET_INDENT - 2, 0);
    const cwdBoxWidth = Math.max(contentWidth - HEADING.length, 0);
    const cwdWidth = Math.max(cwdBoxWidth - COLUMN_GAP, 0);
    const now = new Date();
    const visible = sessions.slice(scrollOffset, scrollOffset + visibleCount);
    const hiddenAbove = scrollOffset;
    const hiddenBelow = Math.max(sessions.length - scrollOffset - visibleCount, 0);
    return (_jsxs(Box, { flexDirection: "column", width: width, height: height, paddingX: PAD_X, children: [_jsxs(Box, { width: contentWidth, children: [_jsx(Text, { color: TEXT_PRIMARY, bold: true, children: fitToWidth(HEADING, contentWidth) }), _jsx(Box, { width: cwdBoxWidth, justifyContent: "flex-end", children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate", children: fitToWidth(cwd, cwdWidth) }) })] }), _jsx(Rule, { width: contentWidth }), _jsx(Box, { width: contentWidth, height: 1, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate", children: hiddenAbove > 0
                        ? fitToWidth(`▲ ${hiddenAbove} more above`, contentWidth)
                        : " " }) }), _jsx(Box, { flexDirection: "column", width: contentWidth, flexShrink: 0, children: sessions.length === 0 ? (_jsx(Text, { color: TEXT_DIM, wrap: "truncate", children: hintForWidth("No sessions started in this directory yet", "No sessions here yet", contentWidth) })) : (visible.map((session, visibleIdx) => {
                    const active = visibleIdx + scrollOffset === selectedIdx;
                    return (_jsxs(Box, { flexDirection: "column", width: contentWidth, children: [_jsxs(Box, { width: contentWidth, children: [_jsx(Text, { color: active ? GOLD : TEXT_DIM, children: active ? "▸ " : "  " }), _jsx(Box, { width: titleWidth, marginRight: COLUMN_GAP, children: _jsx(Text, { color: active ? TEXT_PRIMARY : TEXT_DIM, bold: active, wrap: "truncate", children: fitToWidth(session.title, titleWidth) }) }), _jsx(Box, { width: metaWidth, justifyContent: "flex-end", children: _jsx(Text, { color: active ? TEAL : TEXT_DIM, wrap: "truncate", children: fitToWidth(sessionMeta(session, now), metaWidth) }) })] }), _jsx(Box, { width: contentWidth, paddingLeft: SNIPPET_INDENT, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate", children: session.snippet
                                        ? `"${fitToWidth(session.snippet, snippetWidth)}"`
                                        : " " }) })] }, session.id));
                })) }), _jsx(Box, { flexGrow: 1 }), _jsx(Box, { width: contentWidth, height: 1, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate", children: hiddenBelow > 0
                        ? fitToWidth(`▼ ${hiddenBelow} more below`, contentWidth)
                        : " " }) }), _jsx(Rule, { width: contentWidth }), _jsx(Box, { width: contentWidth, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate", children: sessions.length === 0
                        ? fitToWidth(`enter · ${escapeAction}`, contentWidth)
                        : hintForWidth(`↑↓ select · enter resume · esc ${escapeAction}`, `↑↓ · enter · esc ${escapeAction}`, contentWidth) }) })] }));
});
