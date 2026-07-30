import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { Text } from "ink";
import { RULE_COLOR } from "../colors.js";
export const Rule = React.memo(function Rule({ width }) {
    const ruleWidth = Math.max(width, 1);
    return _jsx(Text, { color: RULE_COLOR, children: "─".repeat(ruleWidth) });
});
