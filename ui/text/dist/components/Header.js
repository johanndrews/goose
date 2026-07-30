import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "./Spinner.js";
import { Rule } from "./Rule.js";
import { TEAL, CRANBERRY, TEXT_PRIMARY, TEXT_DIM, RULE_COLOR } from "../colors.js";
import { isErrorStatus } from "../utils.js";
export const Header = React.memo(function Header({ width, status, loading, spinIdx, providerId, modelId, turnInfo, }) {
    const statusColor = status === "ready" ? TEAL : isErrorStatus(status) ? CRANBERRY : TEXT_DIM;
    const constrainedWidth = Math.max(width, 20);
    const leftSideWidth = Math.min(Math.floor(constrainedWidth * 0.7), constrainedWidth - 15);
    const rightSideWidth = constrainedWidth - leftSideWidth;
    // Active provider/model next to the status. Show "provider · model" when it
    // fits; otherwise show the model, pre-truncated with an ellipsis on narrow
    // terminals (per AGENTS.md Ink-Text) rather than hiding it entirely.
    const provider = providerId || undefined;
    const model = modelId || undefined;
    const modelOnly = model ?? provider;
    const full = provider && model ? `${provider} · ${model}` : modelOnly;
    // Space left for the label after the "goose · " prefix, the status, its
    // " · " separator, and the spinner — so the pre-truncation matches the render.
    const spinnerWidth = loading ? 2 : 0;
    const reserved = "goose · ".length + status.length + " · ".length + spinnerWidth;
    const avail = Math.max(0, leftSideWidth - reserved);
    let modelLabel;
    if (full && full.length <= avail) {
        modelLabel = full;
    }
    else if (modelOnly && avail >= 2) {
        // Cut on code points, not UTF-16 units: slicing an astral character in half
        // would leave a lone surrogate that renders as a replacement glyph.
        modelLabel =
            modelOnly.length <= avail
                ? modelOnly
                : [...modelOnly].slice(0, avail - 1).join("") + "…";
    }
    return (_jsxs(Box, { flexDirection: "column", width: constrainedWidth, flexShrink: 0, children: [_jsxs(Box, { justifyContent: "space-between", width: constrainedWidth, children: [_jsxs(Box, { width: leftSideWidth, children: [_jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "goose" }), modelLabel && (_jsxs(_Fragment, { children: [_jsx(Text, { color: RULE_COLOR, children: " \u00B7 " }), _jsx(Text, { color: TEXT_DIM, wrap: "truncate-end", children: modelLabel })] })), _jsx(Text, { color: RULE_COLOR, children: " \u00B7 " }), _jsx(Box, { flexShrink: 1, children: _jsx(Text, { color: statusColor, wrap: "truncate-end", children: status }) }), loading && (_jsxs(Text, { children: [" ", _jsx(Spinner, { idx: spinIdx })] }))] }), _jsxs(Box, { width: rightSideWidth, justifyContent: "flex-end", children: [turnInfo && turnInfo.total > 1 && (_jsxs(Text, { color: TEXT_DIM, children: [turnInfo.current, "/", turnInfo.total, "  "] })), _jsx(Text, { color: TEXT_DIM, children: "^E exts \u00B7 ^M models \u00B7 ^P providers" })] })] }), _jsx(Rule, { width: constrainedWidth })] }));
});
