import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { Text } from "ink";
import { CRANBERRY } from "../colors.js";
const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
export const Spinner = React.memo(function Spinner({ idx }) {
    return (_jsx(Text, { color: CRANBERRY, children: SPINNER_FRAMES[idx % SPINNER_FRAMES.length] }));
});
export { SPINNER_FRAMES };
