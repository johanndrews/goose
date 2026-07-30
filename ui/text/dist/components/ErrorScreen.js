import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { CRANBERRY, TEXT_PRIMARY, TEXT_DIM } from "../colors.js";
export const ErrorScreen = React.memo(function ErrorScreen({ errorMsg, onRetry }) {
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;
    useInput((ch, key) => {
        if (key.return || key.escape) {
            onRetry();
        }
    });
    const maxWidth = Math.min(columns - 4, 80);
    return (_jsxs(Box, { flexDirection: "column", paddingX: 2, width: maxWidth, children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "\u2717 Setup error" }), errorMsg && (_jsx(Box, { width: maxWidth - 4, children: _jsx(Text, { color: TEXT_PRIMARY, wrap: "wrap", children: errorMsg }) })), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: TEXT_DIM, children: "press enter to retry" }) })] }));
});
