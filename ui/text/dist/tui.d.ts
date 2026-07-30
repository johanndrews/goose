#!/usr/bin/env node
import React from "react";
export interface ToolCallRange {
    responseItemIndex: number;
    startLine: number;
    endLine: number;
}
export interface ContentLayout {
    lines: React.ReactElement[];
    toolCallRanges: ToolCallRange[];
}
