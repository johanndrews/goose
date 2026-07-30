import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { Box, Text } from "ink";
import { TEAL, GOLD, CRANBERRY, TEXT_DIM } from "../colors.js";
import { CONTEXT_BAR_WIDTH, CONTEXT_WARNING_THRESHOLD, CONTEXT_CRITICAL_THRESHOLD, } from "../constants.js";
const INDENT = "  ";
function formatTokenCount(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${Math.round(n / 1_000)}k`;
    return `${n}`;
}
export const ContextBar = React.memo(function ContextBar({ used, size, width, marginTop, }) {
    const constrainedWidth = Math.max(width, 1);
    // Mirrors crates/goose-cli/src/session/output.rs::display_context_usage
    // so the TUI and CLI agree on what "context usage" means for the same session.
    let line;
    let color;
    if (size === 0) {
        line = `${INDENT}context usage unavailable`;
        color = TEXT_DIM;
    }
    else {
        const percentage = Math.min(Math.round((used / size) * 100), 100);
        const counts = `${percentage}% ${formatTokenCount(used)}/${formatTokenCount(size)}`;
        // The numbers carry the information, the bar only illustrates it — so the
        // bar gives up width first. At 40 columns "100% 128k/128k" alone fills it.
        const barWidth = Math.max(0, Math.min(CONTEXT_BAR_WIDTH, constrainedWidth - INDENT.length - counts.length - 1));
        const filled = Math.round((percentage / 100) * barWidth);
        const bar = "━".repeat(filled) + "╌".repeat(barWidth - filled);
        color =
            percentage < CONTEXT_WARNING_THRESHOLD
                ? TEAL
                : percentage < CONTEXT_CRITICAL_THRESHOLD
                    ? GOLD
                    : CRANBERRY;
        line = barWidth > 0 ? `${INDENT}${bar} ${counts}` : `${INDENT}${counts}`;
    }
    return (_jsx(Box, { width: constrainedWidth, marginTop: marginTop, flexShrink: 0, children: _jsx(Text, { color: color, wrap: "truncate-end", children: line }) }));
});
