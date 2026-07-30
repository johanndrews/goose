import React from "react";
import type { ToolCallContent, ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk";
export interface ToolCallInfo {
    toolCallId: string;
    title: string;
    status: ToolCallStatus;
    kind?: ToolKind;
    rawInput?: unknown;
    rawOutput?: unknown;
    content?: ToolCallContent[];
    locations?: Array<{
        path: string;
        line?: number | null;
    }>;
}
export declare function formatJson(value: unknown): string;
/**
 * Render a tool call as a single-line boxed summary.
 *
 * The box always has the same content and height as before; when `selected`
 * is true we swap the border color and show a hint that space will expand it.
 */
export declare function renderToolCallLines(info: ToolCallInfo, width: number, selected: boolean): React.ReactElement[];
/**
 * Height in lines of the rendered single-line tool-call box.
 * Kept in sync with `renderToolCallLines`.
 */
export declare const TOOL_CALL_BOX_HEIGHT = 3;
