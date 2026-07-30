import React from "react";
import type { ResponseItem } from "../types.js";
export declare function emptyLine(key: string, width: number): React.ReactElement;
export declare function renderUserPrompt(userText: string, width: number, turnId: string, collapsedUserPrompt: (text: string, width: number) => React.ReactElement): React.ReactElement[];
export declare function renderToolCallItem(item: ResponseItem & {
    itemType: "tool_call";
}, index: number, width: number, selected: boolean): React.ReactElement[];
export declare function renderErrorItem(item: ResponseItem & {
    itemType: "error";
}, index: number, width: number): React.ReactElement[];
export declare function renderContentItem(item: ResponseItem & {
    itemType: "content_chunk";
}, index: number, width: number): React.ReactElement[];
export declare function renderLoadingIndicator(status: string, spinIdx: number, width: number): React.ReactElement[];
export declare function renderQueuedMessages(queuedMessages: string[], width: number): React.ReactElement[];
