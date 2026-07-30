import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { renderMarkdown } from "../markdown.js";
import { renderToolCallLines } from "../toolcall.js";
import { CRANBERRY, TEXT_DIM, GOLD } from "../colors.js";
import { Spinner } from "./Spinner.js";
export function emptyLine(key, width) {
    return _jsx(Box, { width: width, height: 1, children: _jsx(Text, { children: " " }) }, key);
}
function cachedLines(cache, item, key, build) {
    const hit = cache.get(item);
    if (hit && hit.key === key)
        return hit.lines;
    const lines = build();
    cache.set(item, { key, lines });
    return lines;
}
const toolCallLineCache = new WeakMap();
const contentLineCache = new WeakMap();
export function renderUserPrompt(userText, width, turnId, collapsedUserPrompt) {
    // A replayed session can open with agent output, giving that turn no prompt
    // of its own; an empty prompt line would only suggest the text went missing.
    if (!userText)
        return [];
    const constrainedWidth = Math.max(width - 4, 10);
    return [
        emptyLine(`u-gap-${turnId}`, width),
        _jsxs(Box, { width: width, height: 1, children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "❯ " }), _jsx(Box, { width: constrainedWidth, children: collapsedUserPrompt(userText, constrainedWidth) })] }, `u-prompt-${turnId}`),
    ];
}
export function renderToolCallItem(item, index, width, selected) {
    return cachedLines(toolCallLineCache, item, `${width}|${index}|${selected}`, () => buildToolCallLines(item, index, width, selected));
}
function buildToolCallLines(item, index, width, selected) {
    const info = {
        toolCallId: item.toolCallId,
        title: item.title,
        status: item.status ?? "pending",
        kind: item.kind,
        rawInput: item.rawInput,
        rawOutput: item.rawOutput,
        content: item.content,
        locations: item.locations,
    };
    return [
        emptyLine(`tc-gap-${index}`, width),
        ...renderToolCallLines(info, width, selected),
    ];
}
export function renderErrorItem(item, index, width) {
    const lines = [
        emptyLine(`err-gap-${index}`, width),
        _jsx(Box, { width: width, height: 1, children: _jsx(Text, { color: CRANBERRY, bold: true, children: "⚠ Error: " }) }, `err-box-${index}`),
    ];
    const errorLines = item.message.split("\n");
    errorLines.forEach((line, j) => {
        lines.push(_jsx(Box, { width: width, height: 1, children: _jsx(Box, { width: width, children: _jsx(Text, { color: CRANBERRY, wrap: "truncate", children: line }) }) }, `err-${index}-${j}`));
    });
    return lines;
}
export function renderContentItem(item, index, width) {
    if (item.content.type !== "text" || !item.content.text) {
        return [];
    }
    return cachedLines(contentLineCache, item, `${width}|${index}`, () => buildContentItemLines(item, index, width));
}
function buildContentItemLines(item, index, width) {
    if (item.content.type !== "text")
        return [];
    const constrainedWidth = Math.max(width - 2, 10);
    const mdLines = renderMarkdown(item.content.text, constrainedWidth);
    const lines = [emptyLine(`md-gap-${index}`, width)];
    mdLines.forEach((mdLine, j) => {
        lines.push(_jsx(Box, { width: width, height: 1, children: _jsx(Box, { width: constrainedWidth, children: _jsx(Text, { wrap: "truncate", children: mdLine }) }) }, `md-${index}-${j}`));
    });
    return lines;
}
export function renderLoadingIndicator(status, spinIdx, width) {
    return [
        emptyLine("ld-gap", width),
        _jsxs(Box, { width: width, height: 1, children: [_jsx(Spinner, { idx: spinIdx }), _jsxs(Text, { color: TEXT_DIM, italic: true, children: [" ", status] })] }, "ld"),
    ];
}
export function renderQueuedMessages(queuedMessages, width) {
    const messageWidth = Math.max(width - 20, 10);
    return queuedMessages.map((message, i) => (_jsxs(Box, { width: width, height: 1, children: [_jsx(Text, { color: TEXT_DIM, children: "❯ " }), _jsx(Box, { width: messageWidth, children: _jsx(Text, { wrap: "truncate-end", color: TEXT_DIM, children: message }) }), _jsx(Text, { color: GOLD, dimColor: true, children: " (queued)" })] }, `q-${i}`)));
}
