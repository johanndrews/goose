#!/usr/bin/env node
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect, useCallback, useMemo, useRef, } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import { ControlledMultilineInput } from "ink-multiline-input";
import meow from "meow";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { PROTOCOL_VERSION, ndJsonStream } from "@agentclientprotocol/sdk";
import { GooseClient } from "@aaif/goose-sdk";
import { resolveGooseBinary } from "@aaif/goose-sdk/node";
import Onboarding from "./onboarding.js";
import ConfigureScreen from "./configure.js";
import ExtensionsManager from "./extensions.js";
import { DiffViewer } from "./components/DiffViewer.js";
import { SessionPicker } from "./components/SessionPicker.js";
import { listResumableSessions } from "./sessions.js";
import { emptyLine, renderUserPrompt, renderToolCallItem, renderErrorItem, renderContentItem, renderLoadingIndicator, renderQueuedMessages, } from "./components/ContentRenderers.js";
import { Header } from "./components/Header.js";
import { Rule } from "./components/Rule.js";
import { ToolCallExpanded } from "./components/ToolCallExpanded.js";
import { ContextBar } from "./components/ContextBar.js";
import { AutocompletePopover } from "./components/AutocompletePopover.js";
import { isErrorStatus, formatError, shortenPath } from "./utils.js";
import { CRANBERRY, TEAL, GOLD, TEXT_PRIMARY, TEXT_DIM, RULE_COLOR, } from "./colors.js";
import { Spinner, SPINNER_FRAMES } from "./components/Spinner.js";
import { PASTE_THRESHOLD, INPUT_MAX_ROWS, SENT_PREVIEW_LEN, GOOSE_FRAMES, INITIAL_GREETING, SCROLL_STEP, SCROLL_FAST_MULTIPLIER, } from "./constants.js";
import { tryRunSlashCommand, listSlashCommands, computeCommandHighlight, } from "./slashCommands.js";
import { useAutocomplete, mergeSlashCommands, computeVisibleRows, fetchAgentMentions, } from "./autocomplete.js";
import { useInputEditor } from "./inputEditor.js";
// Static so it doesn't allocate a new style object on every keystroke; only
// applied when a leading command is actually recognised (see InputBar).
const COMMAND_HIGHLIGHT_STYLE = { color: TEAL };
const InputBar = React.memo(function InputBar({ width, input, onChange, onSubmit, queued, scrollHint, placeholder, focused, pastedFull, onPastedFullChange, knownCommands, spaceReserved, arrowsReserved, returnReserved, }) {
    const prevLenRef = useRef(input.length);
    const handleChange = useCallback((newValue) => {
        const delta = newValue.length - prevLenRef.current;
        prevLenRef.current = newValue.length;
        if (delta >= PASTE_THRESHOLD) {
            onPastedFullChange(newValue);
            onChange(newValue);
        }
        else {
            if (pastedFull !== null)
                onPastedFullChange(null);
            onChange(newValue);
        }
    }, [onChange, pastedFull, onPastedFullChange]);
    const handleSubmit = useCallback((value) => {
        prevLenRef.current = 0;
        onPastedFullChange(null);
        onSubmit(value);
    }, [onSubmit, onPastedFullChange]);
    const { cursorIndex } = useInputEditor({
        value: input,
        onChange: handleChange,
        onSubmit: handleSubmit,
        focus: focused,
        isActive: pastedFull === null,
        spaceReserved,
        arrowsReserved,
        returnReserved,
    });
    // Only the leading command is ever expanded, and the display component
    // supports exactly one highlight range, so this is the one span we compute.
    const commandHighlight = useMemo(() => computeCommandHighlight({ value: input, knownCommands }), [input, knownCommands]);
    useInput((ch, key) => {
        if (key.return) {
            handleSubmit(input);
            return;
        }
        if (key.backspace || key.delete) {
            prevLenRef.current = 0;
            onPastedFullChange(null);
            onChange("");
            return;
        }
        if (key.escape) {
            prevLenRef.current = 0;
            onPastedFullChange(null);
            onChange("");
            return;
        }
        if (ch && !key.ctrl && !key.meta) {
            prevLenRef.current = ch.length;
            onPastedFullChange(null);
            onChange(ch);
        }
    }, { isActive: focused && pastedFull !== null });
    const isPasteMode = pastedFull !== null;
    const constrainedWidth = Math.max(width, 20);
    const contentWidth = Math.max(constrainedWidth - 6, 10);
    return (_jsxs(Box, { flexDirection: "column", width: constrainedWidth, children: [scrollHint && (_jsx(Box, { width: constrainedWidth, justifyContent: "flex-end", flexShrink: 0, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate-end", children: "\u2191\u2193 scroll \u00B7 \u2325\u2191\u2193 fast \u00B7 shift+\u2191\u2193 history" }) })), _jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: RULE_COLOR, paddingX: 1, width: constrainedWidth, flexShrink: 0, children: [_jsxs(Box, { children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "❯ " }), isPasteMode ? (_jsx(Box, { width: contentWidth, children: _jsx(Text, { color: TEXT_PRIMARY, wrap: "truncate-end", children: (() => {
                                        const text = pastedFull;
                                        const flat = text
                                            .replace(/\n/g, " ")
                                            .replace(/\s+/g, " ")
                                            .trim();
                                        if (flat.length <= contentWidth)
                                            return flat;
                                        const suffix = ` (${flat.length.toLocaleString()} chars)`;
                                        const previewLen = Math.max(contentWidth - suffix.length - 1, 5);
                                        return flat.slice(0, previewLen) + "…" + suffix;
                                    })() }) })) : (_jsx(Box, { flexGrow: 1, children: _jsx(ControlledMultilineInput, { value: input, cursorIndex: cursorIndex, rows: 1, maxRows: INPUT_MAX_ROWS, placeholder: placeholder, focus: focused, highlight: commandHighlight, highlightStyle: commandHighlight ? COMMAND_HIGHLIGHT_STYLE : undefined }) }))] }), isPasteMode && (_jsx(Box, { children: _jsx(Text, { color: TEXT_DIM, italic: true, children: "enter to send \u00B7 esc to clear" }) })), queued && (_jsx(Box, { children: _jsx(Text, { color: GOLD, dimColor: true, italic: true, children: "message queued \u2014 will send when goose finishes" }) }))] })] }));
});
// The agent forwards an unrecognised /word as ordinary text without saying so,
// so marking the ones it knows is the only way to spot a typo before the answer
// arrives. Only a leading command counts — that is the sole position the agent
// expands one (execute_commands.rs).
function recognisedCommand(text, known) {
    const match = /^\/([a-zA-Z0-9_-]+)(?=\s|$)/.exec(text);
    return match && known.has(match[1]) ? match[0] : null;
}
function buildContentLines({ turn, turnIndex, width, loading, status, spinIdx, selectedToolCallIdx, queuedMessages, knownCommands, }) {
    const lines = [];
    const toolCallRanges = [];
    if (!turn)
        return { lines, toolCallRanges };
    const safeWidth = Math.max(width, 20);
    const turnId = String(turnIndex);
    lines.push(...renderUserPrompt(turn.userText, safeWidth, turnId, (text, availableWidth) => {
        const flat = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        const safeWidth = Math.max(availableWidth, 10);
        const maxPreview = Math.max(safeWidth - 30, Math.min(SENT_PREVIEW_LEN, safeWidth - 10));
        const command = recognisedCommand(flat, knownCommands);
        if (flat.length <= maxPreview + 10) {
            return (_jsx(Box, { width: safeWidth, children: _jsxs(Text, { color: TEXT_PRIMARY, bold: true, wrap: "wrap", children: [command && _jsx(Text, { color: TEAL, children: command }), command ? flat.slice(command.length) : flat] }) }));
        }
        const preview = flat.slice(0, maxPreview) + "…";
        const remaining = flat.length - maxPreview;
        return (_jsxs(Box, { width: safeWidth, children: [_jsxs(Text, { color: TEXT_PRIMARY, bold: true, wrap: "wrap", children: [command && _jsx(Text, { color: TEAL, children: command }), command ? preview.slice(command.length) : preview] }), _jsxs(Text, { color: TEXT_DIM, children: [" ", "(", remaining.toLocaleString(), " more chars)"] })] }));
    }));
    let tcIdx = 0;
    for (let i = 0; i < turn.responseItems.length; i++) {
        const item = turn.responseItems[i];
        if (item.itemType === "tool_call") {
            const isSelected = selectedToolCallIdx === tcIdx;
            const rendered = renderToolCallItem(item, i, safeWidth, isSelected);
            const startLine = lines.length;
            lines.push(...rendered);
            toolCallRanges.push({
                responseItemIndex: i,
                startLine,
                endLine: lines.length - 1,
            });
            tcIdx++;
        }
        else if (item.itemType === "error") {
            lines.push(...renderErrorItem(item, i, safeWidth));
        }
        else if (item.itemType === "content_chunk") {
            lines.push(...renderContentItem(item, i, safeWidth));
        }
    }
    if (loading) {
        lines.push(...renderLoadingIndicator(status, spinIdx, safeWidth));
    }
    lines.push(...renderQueuedMessages(queuedMessages, safeWidth));
    return { lines, toolCallRanges };
}
const Viewport = React.memo(function Viewport({ lines, height, width, scrollOffset, }) {
    const total = lines.length;
    const overflows = total > height;
    const contentHeight = overflows ? Math.max(height - 2, 1) : height;
    const maxEnd = total;
    const minEnd = Math.min(contentHeight, total);
    const endIdx = Math.max(minEnd, Math.min(maxEnd - scrollOffset, maxEnd));
    const startIdx = Math.max(0, endIdx - contentHeight);
    const visible = lines.slice(startIdx, endIdx);
    const padCount = contentHeight - visible.length;
    const elements = [];
    if (overflows) {
        const above = startIdx;
        elements.push(_jsx(Box, { width: width, height: 1, justifyContent: "center", children: above > 0 ? (_jsxs(Text, { color: TEXT_DIM, children: ["\u25B2 ", above, " more (\u2191)"] })) : (_jsx(Text, { children: " " })) }, "si-up"));
    }
    for (let i = 0; i < padCount; i++) {
        elements.push(emptyLine(`vp-pad-${i}`, width));
    }
    elements.push(...visible);
    if (overflows) {
        const below = total - endIdx;
        elements.push(_jsx(Box, { width: width, height: 1, justifyContent: "center", children: below > 0 ? (_jsxs(Text, { color: TEXT_DIM, children: ["\u25BC ", below, " more (\u2193)"] })) : (_jsx(Text, { children: " " })) }, "si-dn"));
    }
    const constrainedWidth = Math.max(width, 10);
    const constrainedHeight = Math.max(height, 1);
    return (_jsx(Box, { flexDirection: "column", height: constrainedHeight, width: constrainedWidth, children: elements }));
});
const SplashScreen = React.memo(function SplashScreen({ animFrame, width, height, status, loading, spinIdx, cwd, }) {
    const frame = GOOSE_FRAMES[animFrame % GOOSE_FRAMES.length];
    const statusColor = status === "ready" ? TEAL : isErrorStatus(status) ? CRANBERRY : TEXT_DIM;
    // Shed content as the allotted height shrinks, largest first, so the splash
    // always fits: the goose frame goes before the title, tagline and status, and
    // the cwd only appears once everything else has room.
    const chromeHeight = 1 + 1 + 1 + 2 + 1; // title (margin + line), tagline, status (margin + line)
    const showFrame = height >= chromeHeight + frame.length;
    const baseHeight = chromeHeight + (showFrame ? frame.length : 0);
    const showCwd = height >= baseHeight + 1;
    const contentHeight = baseHeight + (showCwd ? 1 : 0);
    const topPad = Math.max(0, Math.floor((height - contentHeight) / 2));
    // Use original dimensions for outer container to maintain centering
    const safeWidth = Math.max(width, 20);
    // No lower clamp: the caller already subtracted everything below, so anything
    // we insist on here is a row the root does not have.
    const safeHeight = Math.max(height, 0);
    return (_jsxs(Box, { flexDirection: "column", alignItems: "center", width: safeWidth, height: safeHeight, overflow: "hidden", children: [topPad > 0 && _jsx(Box, { height: topPad }), showFrame && (_jsx(Box, { flexDirection: "column", alignItems: "center", children: frame.map((line, i) => (_jsx(Text, { color: TEXT_PRIMARY, children: line }, i))) })), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "goose" }) }), _jsx(Box, { alignItems: "center", children: _jsx(Text, { color: TEXT_DIM, children: "your on-machine AI agent" }) }), showCwd && (_jsx(Box, { width: Math.min(safeWidth, 60), justifyContent: "center", children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate-middle", children: cwd }) })), _jsxs(Box, { marginTop: 2, gap: 1, alignItems: "center", children: [loading && _jsx(Spinner, { idx: spinIdx }), _jsx(Text, { color: statusColor, children: status })] })] }));
});
// An unconfigured provider reaches us as null, "" or the literal string "null".
function hasConfiguredProvider(providerId) {
    return providerId != null && providerId !== "" && providerId !== "null";
}
function selectedConfigValue(options, id) {
    const option = options.find((o) => o.id === id);
    return option?.type === "select" ? option.currentValue : undefined;
}
// The TUI cannot change directory, so this is fixed for the whole process.
const CWD_DISPLAY = shortenPath(process.cwd());
function App({ serverConnection, initialPrompt, resume, }) {
    const { exit } = useApp();
    const { stdout } = useStdout();
    // `useStdout()` returns the live stream but does not trigger a React
    // re-render when the terminal is resized. Without this subscription the
    // outer Box keeps its old width/height after SIGWINCH, producing a
    // misaligned frame until some other state change forces a render.
    const [termSize, setTermSize] = useState(() => ({
        width: stdout?.columns ?? 80,
        height: stdout?.rows ?? 24,
    }));
    useEffect(() => {
        if (!stdout)
            return;
        const onResize = () => {
            setTermSize({
                width: stdout.columns ?? 80,
                height: stdout.rows ?? 24,
            });
        };
        stdout.on("resize", onResize);
        return () => {
            stdout.off("resize", onResize);
        };
    }, [stdout]);
    const termWidth = termSize.width;
    const termHeight = termSize.height;
    const [turns, setTurns] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("connecting…");
    const [defaults, setDefaults] = useState({});
    // null means "no usage_update received yet" (renders nothing), distinct
    // from a real {used: 0, size: 0} snapshot.
    const [usage, setUsage] = useState(null);
    const [spinIdx, setSpinIdx] = useState(0);
    const [gooseFrame, setGooseFrame] = useState(0);
    const [bannerVisible, setBannerVisible] = useState(true);
    const [queuedMessages, setQueuedMessages] = useState([]);
    const [viewTurnIdx, setViewTurnIdx] = useState(-1);
    const [selectedToolCallIdx, setSelectedToolCallIdx] = useState(null);
    const [toolCallExpanded, setToolCallExpanded] = useState(false);
    const [toolCallExpandedScroll, setToolCallExpandedScroll] = useState(0);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [pastedFull, setPastedFull] = useState(null);
    const [needsOnboarding, setNeedsOnboarding] = useState(false);
    const [pushedCommands, setPushedCommands] = useState([]);
    const [mentions, setMentions] = useState([]);
    const [mentionsStatus, setMentionsStatus] = useState("loading");
    const [sessionChoices, setSessionChoices] = useState(null);
    const [overlay, setOverlay] = useState(null);
    // Built once: the registry doesn't change during a run, and only its
    // command names matter for recognising a leading "/name" in the input.
    const knownCommands = useMemo(() => new Set(listSlashCommands().map((cmd) => cmd.name)), []);
    const clientRef = useRef(null);
    const sessionIdRef = useRef(null);
    const sessionCwdRef = useRef(process.cwd());
    const modelRef = useRef(undefined);
    const streamBuf = useRef("");
    // Loading a session replays its history as notifications. They arrive on the
    // same channel as live output, so the handler needs to know which is which.
    const replayRef = useRef({ active: false, turnOpen: false });
    const sentInitialPrompt = useRef(false);
    const queueRef = useRef([]);
    const isProcessingRef = useRef(false);
    // Only run the animation tick when something is actually animating:
    // the splash goose while the banner is up, or the spinner while loading.
    // Otherwise we were re-rendering the entire viewport every 300ms forever,
    // which rebuilds every turn's markdown and can OOM long-running sessions.
    useEffect(() => {
        if (!bannerVisible && !loading)
            return;
        const t = setInterval(() => {
            if (loading)
                setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length);
            if (bannerVisible)
                setGooseFrame((f) => (f + 1) % GOOSE_FRAMES.length);
        }, 300);
        return () => clearInterval(t);
    }, [bannerVisible, loading]);
    useEffect(() => {
        if (turns.length > 0)
            setBannerVisible(false);
    }, [turns]);
    useEffect(() => {
        setSelectedToolCallIdx(null);
        setToolCallExpanded(false);
        setToolCallExpandedScroll(0);
        setScrollOffset(0);
    }, [viewTurnIdx, turns.length]);
    // Re-layout invalidates any scroll offset we were holding (line counts
    // change with width), so snap back to the latest content on resize.
    useEffect(() => {
        setScrollOffset(0);
    }, [termWidth, termHeight]);
    const appendAgent = useCallback((text) => {
        setTurns((prev) => {
            if (prev.length === 0)
                return prev;
            const last = { ...prev[prev.length - 1] };
            const newItems = [...last.responseItems];
            if (newItems.length > 0 &&
                newItems[newItems.length - 1].itemType === "content_chunk") {
                const lastItem = newItems[newItems.length - 1];
                if (lastItem.content.type === "text") {
                    newItems[newItems.length - 1] = {
                        ...lastItem,
                        content: {
                            ...lastItem.content,
                            text: lastItem.content.text + text,
                        },
                    };
                }
                else {
                    newItems.push({
                        itemType: "content_chunk",
                        content: { type: "text", text },
                    });
                }
            }
            else {
                newItems.push({
                    itemType: "content_chunk",
                    content: { type: "text", text },
                });
            }
            return [...prev.slice(0, -1), { ...last, responseItems: newItems }];
        });
    }, []);
    const appendError = useCallback((errorMessage) => {
        setTurns((prev) => {
            if (prev.length === 0)
                return prev;
            const last = { ...prev[prev.length - 1] };
            const newItems = [...last.responseItems];
            newItems.push({ itemType: "error", message: errorMessage });
            return [...prev.slice(0, -1), { ...last, responseItems: newItems }];
        });
    }, []);
    const handleToolCall = useCallback((tc) => {
        setTurns((prev) => {
            if (prev.length === 0)
                return prev;
            const last = { ...prev[prev.length - 1] };
            const newItems = [...last.responseItems];
            const newById = new Map(last.toolCallsById);
            const index = newItems.length;
            newItems.push({ ...tc, itemType: "tool_call" });
            newById.set(tc.toolCallId, index);
            return [
                ...prev.slice(0, -1),
                { ...last, responseItems: newItems, toolCallsById: newById },
            ];
        });
    }, []);
    const handleToolCallUpdate = useCallback((update) => {
        setTurns((prev) => {
            if (prev.length === 0)
                return prev;
            const last = { ...prev[prev.length - 1] };
            const index = last.toolCallsById.get(update.toolCallId);
            if (index === undefined)
                return prev;
            const item = last.responseItems[index];
            if (!item || item.itemType !== "tool_call")
                return prev;
            const updated = { ...item };
            if (update.title != null)
                updated.title = update.title;
            if (update.status != null)
                updated.status = update.status;
            if (update.kind != null)
                updated.kind = update.kind;
            if (update.rawInput !== undefined)
                updated.rawInput = update.rawInput;
            if (update.rawOutput !== undefined)
                updated.rawOutput = update.rawOutput;
            if (update.content != null)
                updated.content = update.content;
            if (update.locations != null)
                updated.locations = update.locations;
            const newItems = [...last.responseItems];
            newItems[index] = updated;
            return [...prev.slice(0, -1), { ...last, responseItems: newItems }];
        });
    }, []);
    const addUserTurn = useCallback((text) => {
        setTurns((prev) => [
            ...prev,
            { userText: text, responseItems: [], toolCallsById: new Map() },
        ]);
        setViewTurnIdx(-1);
        setSelectedToolCallIdx(null);
        setToolCallExpanded(false);
        setToolCallExpandedScroll(0);
        setScrollOffset(0);
    }, []);
    // A replayed session can open with agent output — a recipe's first answer,
    // say. That content still needs a turn to land in, even without a prompt.
    const openReplayTurn = useCallback(() => {
        if (!replayRef.current.active || replayRef.current.turnOpen)
            return;
        replayRef.current.turnOpen = true;
        addUserTurn("");
    }, [addUserTurn]);
    const executePrompt = useCallback(async (text) => {
        const client = clientRef.current;
        const sid = sessionIdRef.current;
        if (!client || !sid)
            return;
        addUserTurn(text);
        setLoading(true);
        setStatus("thinking…");
        streamBuf.current = "";
        try {
            const result = await client.prompt({
                sessionId: sid,
                prompt: [{ type: "text", text }],
            });
            if (streamBuf.current)
                appendAgent("");
            setStatus(result.stopReason === "end_turn"
                ? "ready"
                : `stopped: ${result.stopReason}`);
        }
        catch (e) {
            const errorMsg = formatError(e);
            setStatus(`error`);
            appendError(errorMsg);
        }
        finally {
            setLoading(false);
        }
    }, [appendAgent, appendError, addUserTurn]);
    const processQueue = useCallback(async () => {
        if (isProcessingRef.current)
            return;
        isProcessingRef.current = true;
        while (queueRef.current.length > 0) {
            const next = queueRef.current.shift();
            setQueuedMessages([...queueRef.current]);
            await executePrompt(next);
        }
        isProcessingRef.current = false;
    }, [executePrompt]);
    const sendPrompt = useCallback(async (text) => {
        await executePrompt(text);
        if (queueRef.current.length > 0)
            processQueue();
    }, [executePrompt, processQueue]);
    const readDefaults = useCallback(async (client) => {
        const resp = await client.goose.defaultsRead_unstable({});
        setDefaults({ providerId: resp.providerId, modelId: resp.modelId });
        return resp;
    }, []);
    const createSession = useCallback(async (client) => {
        setStatus("creating session…");
        setLoading(true);
        try {
            const cwd = process.cwd();
            sessionCwdRef.current = cwd;
            const session = await client.newSession({
                cwd,
                mcpServers: [],
            });
            sessionIdRef.current = session.sessionId;
            setLoading(false);
            setStatus("ready");
            // Fire-and-forget: agent mentions have no push equivalent, so warm
            // the @ cache now instead of blocking session creation on it.
            fetchAgentMentions(client, { cwd, sessionId: session.sessionId })
                .then((agents) => {
                setMentions(agents);
                setMentionsStatus("ready");
            })
                .catch(() => setMentionsStatus("error"));
            if (initialPrompt && !sentInitialPrompt.current) {
                sentInitialPrompt.current = true;
                await sendPrompt(initialPrompt);
                setTimeout(() => exit(), 100);
            }
        }
        catch (e) {
            const errorMsg = formatError(e);
            setStatus(`failed: ${errorMsg}`);
            setLoading(false);
        }
    }, [initialPrompt, sendPrompt, exit]);
    const resumeSession = useCallback(async (client, sessionId) => {
        setStatus("restoring session…");
        setLoading(true);
        // Switching sessions while one is open: its transcript must not stay
        // above the replayed one.
        setTurns([]);
        setViewTurnIdx(-1);
        setSelectedToolCallIdx(null);
        setToolCallExpanded(false);
        setToolCallExpandedScroll(0);
        setScrollOffset(0);
        const cwd = process.cwd();
        sessionCwdRef.current = cwd;
        replayRef.current = { active: true, turnOpen: false };
        try {
            await client.loadSession({ sessionId, cwd, mcpServers: [] });
            sessionIdRef.current = sessionId;
            setStatus("ready");
        }
        catch (e) {
            setStatus(`failed to resume ${sessionId}: ${formatError(e)}`);
        }
        finally {
            replayRef.current.active = false;
            setLoading(false);
        }
    }, []);
    const offerSessionChoices = useCallback(async (client) => {
        setStatus("loading sessions…");
        try {
            setSessionChoices(await listResumableSessions(client, process.cwd()));
            setStatus("select a session");
        }
        catch (e) {
            setStatus(`failed: ${formatError(e)}`);
        }
        finally {
            setLoading(false);
        }
    }, []);
    const handleSessionChoice = useCallback((session) => {
        setSessionChoices(null);
        const client = clientRef.current;
        if (client)
            resumeSession(client, session.id);
    }, [resumeSession]);
    // Cancelling at startup means "start fresh"; cancelling from a session that
    // is already open just closes the picker and leaves it running.
    const handleSessionChoiceCancelled = useCallback(() => {
        setSessionChoices(null);
        if (sessionIdRef.current)
            return;
        const client = clientRef.current;
        if (client)
            createSession(client);
    }, [createSession]);
    const handleOnboardingComplete = useCallback(async () => {
        setNeedsOnboarding(false);
        const client = clientRef.current;
        if (!client)
            return;
        // Onboarding configures the provider; the core then picks the model. Neither
        // value is known to the wizard, so re-read both to fill the header.
        try {
            await readDefaults(client);
        }
        catch {
            // Header stays unlabelled — creating the session matters more.
        }
        await createSession(client);
    }, [createSession, readDefaults]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setStatus("initializing…");
                const client = new GooseClient(() => ({
                    requestPermission: async (params) => {
                        const optionId = params.options?.[0]?.optionId ?? "approve";
                        return {
                            outcome: {
                                outcome: "selected",
                                optionId,
                            },
                        };
                    },
                    sessionUpdate: async (params) => {
                        const update = params.update;
                        if (update.sessionUpdate === "user_message_chunk") {
                            // Live prompts already opened their turn in executePrompt; only
                            // a replay reaches this, and every user message starts a turn.
                            if (replayRef.current.active && update.content.type === "text") {
                                replayRef.current.turnOpen = true;
                                addUserTurn(update.content.text);
                            }
                        }
                        else if (update.sessionUpdate === "agent_message_chunk") {
                            if (update.content.type === "text") {
                                openReplayTurn();
                                streamBuf.current += update.content.text;
                                appendAgent(update.content.text);
                            }
                        }
                        else if (update.sessionUpdate === "tool_call") {
                            openReplayTurn();
                            handleToolCall(update);
                        }
                        else if (update.sessionUpdate === "tool_call_update") {
                            handleToolCallUpdate(update);
                        }
                        else if (update.sessionUpdate === "config_option_update") {
                            // The agent emits this after every accepted config change, so it
                            // also covers a provider switch whose model change then failed.
                            // An absent option says nothing about its value — keep the old one.
                            const providerId = selectedConfigValue(update.configOptions, "provider");
                            const modelId = selectedConfigValue(update.configOptions, "model");
                            setDefaults((prev) => ({
                                providerId: providerId ?? prev.providerId,
                                modelId: modelId ?? prev.modelId,
                            }));
                            // Switching models or providers can change the context limit,
                            // but no fresh usage arrives with the change. Drop the snapshot
                            // rather than divide by the old limit until the next turn ends.
                            // The key carries both, since the same model id can sit behind
                            // two providers with different limits.
                            const usageKey = `${providerId ?? ""}/${modelId ?? ""}`;
                            if (usageKey !== "/" && usageKey !== modelRef.current) {
                                modelRef.current = usageKey;
                                setUsage(null);
                            }
                        }
                        else if (update.sessionUpdate === "usage_update") {
                            setUsage({ used: update.used, size: update.size });
                        }
                        else if (update.sessionUpdate === "available_commands_update") {
                            setPushedCommands(update.availableCommands);
                        }
                    },
                }), serverConnection);
                if (cancelled)
                    return;
                clientRef.current = client;
                setStatus("handshaking…");
                await client.initialize({
                    protocolVersion: PROTOCOL_VERSION,
                    clientInfo: { name: "goose-text", version: "0.1.0" },
                    clientCapabilities: {},
                });
                if (cancelled)
                    return;
                setStatus("checking provider…");
                let hasProvider = false;
                try {
                    const resp = await readDefaults(client);
                    hasProvider = hasConfiguredProvider(resp.providerId);
                }
                catch {
                    hasProvider = false;
                }
                if (cancelled)
                    return;
                if (!hasProvider && !initialPrompt) {
                    setNeedsOnboarding(true);
                    setLoading(false);
                    setStatus("setup required");
                    return;
                }
                if (resume === undefined) {
                    await createSession(client);
                }
                else if (resume) {
                    await resumeSession(client, resume);
                }
                else {
                    await offerSessionChoices(client);
                }
            }
            catch (e) {
                if (cancelled)
                    return;
                const errorMsg = formatError(e);
                setStatus(`failed: ${errorMsg}`);
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        serverConnection,
        initialPrompt,
        resume,
        createSession,
        readDefaults,
        resumeSession,
        offerSessionChoices,
        addUserTurn,
        openReplayTurn,
        appendAgent,
        handleToolCall,
        handleToolCallUpdate,
        exit,
    ]);
    const addLocalTurn = useCallback((userText, message) => {
        setTurns((prev) => [
            ...prev,
            {
                userText,
                responseItems: message
                    ? [
                        {
                            itemType: "content_chunk",
                            content: { type: "text", text: message },
                        },
                    ]
                    : [],
                toolCallsById: new Map(),
            },
        ]);
        setViewTurnIdx(-1);
        setSelectedToolCallIdx(null);
        setToolCallExpanded(false);
        setToolCallExpandedScroll(0);
        setScrollOffset(0);
    }, []);
    const runSlashCommand = useCallback((raw) => {
        const result = tryRunSlashCommand(raw, {
            cwd: sessionCwdRef.current,
        });
        if (!result.handled)
            return false;
        if ("overlay" in result && result.overlay === "diff") {
            setOverlay({
                screen: "diff",
                content: result.content,
                truncated: result.truncated,
            });
            return true;
        }
        if ("overlay" in result && result.overlay === "sessions") {
            const client = clientRef.current;
            if (!client)
                return true;
            // Swapping the session mid-turn would feed the running answer into a
            // transcript it does not belong to.
            if (loading || isProcessingRef.current) {
                addLocalTurn(raw, "goose is still working — try again once it stops");
                return true;
            }
            offerSessionChoices(client);
            return true;
        }
        addLocalTurn(raw, "message" in result ? result.message : undefined);
        return true;
    }, [addLocalTurn, loading, offerSessionChoices]);
    const handleSubmit = useCallback((value) => {
        const trimmed = value.trim();
        if (!trimmed)
            return;
        setInput("");
        setPastedFull(null);
        setViewTurnIdx(-1);
        setSelectedToolCallIdx(null);
        setToolCallExpanded(false);
        setToolCallExpandedScroll(0);
        setScrollOffset(0);
        if (trimmed.startsWith("/") && runSlashCommand(trimmed))
            return;
        if (loading || isProcessingRef.current) {
            queueRef.current.push(trimmed);
            setQueuedMessages([...queueRef.current]);
        }
        else {
            sendPrompt(trimmed);
        }
    }, [loading, sendPrompt, runSlashCommand]);
    const localCommands = useMemo(() => listSlashCommands(), []);
    const displayCommands = useMemo(() => mergeSlashCommands(localCommands, pushedCommands), [localCommands, pushedCommands]);
    const knownCommandNames = useMemo(() => new Set(displayCommands.map((c) => c.name)), [displayCommands]);
    // No remount needed any more: the in-tree editor puts the caret at the end
    // of a value it did not produce itself, which is exactly this case.
    const handleAutocompleteAccept = useCallback((value) => {
        setInput(value);
    }, []);
    const autocomplete = useAutocomplete({
        input,
        onAccept: handleAutocompleteAccept,
        commands: displayCommands,
        mentions,
        mentionsStatus,
    });
    const PAD_X = 2;
    const PAD_TOP = 0;
    const PAD_BOTTOM = 0;
    const safeTermWidth = Math.max(termWidth, 40);
    const safeTermHeight = Math.max(termHeight, 10);
    const contentWidth = Math.max(safeTermWidth - PAD_X * 2, 20);
    const effectiveTurnIdx = viewTurnIdx === -1 ? turns.length - 1 : viewTurnIdx;
    const currentTurn = turns[effectiveTurnIdx];
    const isViewingHistory = viewTurnIdx !== -1 && viewTurnIdx < turns.length - 1;
    const isLatest = !isViewingHistory;
    const showInputBar = !initialPrompt && !isViewingHistory;
    // Same condition passed to InputBar's `scrollHint` prop below — hoisted so
    // the height budget and the render agree on when the hint row exists.
    const showScrollHint = !bannerVisible && turns.length > 1;
    const headerH = 2;
    const isPasteMode = pastedFull !== null;
    const inputContentRows = showInputBar
        ? isPasteMode
            ? 1
            : Math.min(Math.max(input.split("\n").length, 1), INPUT_MAX_ROWS)
        : 0;
    const inputExtraLines = (isPasteMode ? 1 : 0) + (queuedMessages.length > 0 ? 1 : 0);
    const inputBarH = showInputBar ? 2 + inputContentRows + inputExtraLines : 0;
    const historyBarH = isViewingHistory ? 2 : 0;
    const usageBarH = showInputBar && usage !== null ? 1 : 0;
    // One blank line separates the transcript from the input area, rendered as
    // its own row so it does not depend on which element happens to come first.
    const inputGapH = showInputBar ? 1 : 0;
    // The scroll hint sits on its own row above the input box instead of beside
    // the text, where the two used to squeeze each other.
    const scrollHintRowH = showInputBar && showScrollHint ? 1 : 0;
    // Room left for the autocomplete popover beyond the viewport's own floor
    // below, so suggestions never push the transcript past it.
    const autocompleteAvailableH = safeTermHeight -
        headerH -
        inputBarH -
        usageBarH -
        inputGapH -
        scrollHintRowH -
        historyBarH -
        3;
    const autocompleteVisibleRows = computeVisibleRows(autocomplete.displayRowCount, autocompleteAvailableH);
    const autocompleteReservedH = autocompleteVisibleRows > 0 ? autocompleteVisibleRows + 1 : 0;
    // Everything below the transcript. Both the viewport and the splash screen
    // size themselves against this, so they cannot drift apart.
    const inputAreaH = inputGapH +
        usageBarH +
        autocompleteReservedH +
        scrollHintRowH +
        inputBarH;
    // No lower bound below: a floor would claim rows the terminal does not have,
    // and the transcript is what can be given up when the input grows tall.
    const viewportHeight = Math.max(safeTermHeight - PAD_TOP - PAD_BOTTOM - headerH - historyBarH - inputAreaH, 0);
    const contentLayout = useMemo(() => buildContentLines({
        turn: currentTurn,
        turnIndex: effectiveTurnIdx,
        width: contentWidth,
        loading: isLatest && loading,
        status,
        spinIdx,
        selectedToolCallIdx,
        queuedMessages: isLatest ? queuedMessages : [],
        knownCommands: knownCommandNames,
    }), [
        currentTurn,
        effectiveTurnIdx,
        contentWidth,
        isLatest,
        loading,
        status,
        spinIdx,
        selectedToolCallIdx,
        queuedMessages,
        knownCommandNames,
    ]);
    const contentLines = contentLayout.lines;
    const toolCallRanges = contentLayout.toolCallRanges;
    useEffect(() => {
        if (selectedToolCallIdx !== null &&
            selectedToolCallIdx >= toolCallRanges.length) {
            setSelectedToolCallIdx(toolCallRanges.length === 0 ? null : toolCallRanges.length - 1);
        }
    }, [toolCallRanges.length, selectedToolCallIdx]);
    const selectedToolCallInfo = useMemo(() => {
        if (selectedToolCallIdx === null || !currentTurn)
            return null;
        const range = toolCallRanges[selectedToolCallIdx];
        if (!range)
            return null;
        const item = currentTurn.responseItems[range.responseItemIndex];
        if (!item || item.itemType !== "tool_call")
            return null;
        return {
            toolCallId: item.toolCallId,
            title: item.title,
            status: item.status ?? "pending",
            kind: item.kind,
            rawInput: item.rawInput,
            rawOutput: item.rawOutput,
            content: item.content,
            locations: item.locations,
        };
    }, [selectedToolCallIdx, toolCallRanges, currentTurn]);
    // Compute a scroll offset that keeps the given tool-call range fully
    // visible, moving just enough from the current offset. scrollOffset is
    // measured in lines-from-bottom, matching Viewport's math.
    const scrollOffsetForRange = useCallback((range, current) => {
        const total = contentLines.length;
        const overflows = total > viewportHeight;
        const contentHeight = overflows
            ? Math.max(viewportHeight - 2, 1)
            : viewportHeight;
        if (!overflows)
            return 0;
        const maxOffset = total - contentHeight;
        const minForTop = total - range.startLine - contentHeight;
        const maxForBottom = total - range.endLine - 1;
        const lo = Math.max(0, minForTop);
        const hi = Math.max(lo, Math.min(maxOffset, maxForBottom));
        if (current < lo)
            return lo;
        if (current > hi)
            return hi;
        return current;
    }, [contentLines.length, viewportHeight]);
    const moveSelection = useCallback((direction) => {
        if (toolCallRanges.length === 0)
            return false;
        let nextIdx;
        if (selectedToolCallIdx === null) {
            nextIdx = direction === -1 ? toolCallRanges.length - 1 : 0;
        }
        else {
            nextIdx = selectedToolCallIdx + direction;
            if (nextIdx < 0 || nextIdx >= toolCallRanges.length)
                return false;
        }
        setSelectedToolCallIdx(nextIdx);
        const range = toolCallRanges[nextIdx];
        setScrollOffset((prev) => scrollOffsetForRange(range, prev));
        return true;
    }, [toolCallRanges, selectedToolCallIdx, scrollOffsetForRange]);
    useInput((ch, key) => {
        if (toolCallExpanded)
            return;
        if (key.escape || (ch === "c" && key.ctrl)) {
            if (key.escape && pastedFull !== null)
                return;
            exit();
        }
        if (!loading && sessionIdRef.current) {
            if (key.ctrl && (ch === "p" || ch === "P")) {
                setOverlay({ screen: "configure", intent: "provider" });
                return;
            }
            if (key.ctrl && (ch === "m" || ch === "M")) {
                setOverlay({ screen: "configure", intent: "model" });
                return;
            }
            if (key.ctrl && (ch === "e" || ch === "E")) {
                setOverlay({ screen: "extensions" });
                return;
            }
            if (ch === "g" && key.ctrl) {
                setOverlay({ screen: "configure", intent: "provider" });
                return;
            }
        }
        const viewingHistory = viewTurnIdx !== -1 && viewTurnIdx < turns.length - 1;
        const multilineOwnsArrows = !initialPrompt &&
            !viewingHistory &&
            pastedFull === null &&
            input.includes("\n");
        if (ch === " " && selectedToolCallIdx !== null) {
            setToolCallExpandedScroll(0);
            setToolCallExpanded(true);
            return;
        }
        if ((key.upArrow || key.downArrow) && !key.shift) {
            if (multilineOwnsArrows)
                return;
            if (key.meta) {
                const step = SCROLL_STEP * SCROLL_FAST_MULTIPLIER;
                if (key.upArrow) {
                    setScrollOffset((prev) => prev + step);
                }
                else {
                    setScrollOffset((prev) => Math.max(prev - step, 0));
                }
                return;
            }
            if (toolCallRanges.length > 0) {
                const direction = key.upArrow ? -1 : 1;
                if (moveSelection(direction))
                    return;
                if (selectedToolCallIdx !== null) {
                    setSelectedToolCallIdx(null);
                }
            }
            const step = SCROLL_STEP;
            if (key.upArrow) {
                setScrollOffset((prev) => prev + step);
            }
            else {
                setScrollOffset((prev) => Math.max(prev - step, 0));
            }
            return;
        }
        if (key.upArrow && key.shift) {
            setTurns((cur) => {
                if (cur.length <= 1)
                    return cur;
                setViewTurnIdx((prev) => {
                    const eff = prev === -1 ? cur.length - 1 : prev;
                    return Math.max(eff - 1, 0);
                });
                return cur;
            });
            return;
        }
        if (key.downArrow && key.shift) {
            setTurns((cur) => {
                if (cur.length <= 1)
                    return cur;
                setViewTurnIdx((prev) => {
                    if (prev === -1)
                        return -1;
                    const next = prev + 1;
                    return next >= cur.length ? -1 : next;
                });
                return cur;
            });
            return;
        }
    }, 
    // Fully disabled while the popover or the session picker is open:
    // otherwise Escape here would quit the app instead of dismissing them, and
    // up/down would scroll the transcript in parallel with moving the
    // highlighted entry.
    {
        isActive: !needsOnboarding && !overlay && !autocomplete.open && !sessionChoices,
    });
    if (sessionChoices) {
        return (_jsx(Box, { flexDirection: "column", width: safeTermWidth, height: safeTermHeight, children: _jsx(SessionPicker, { sessions: sessionChoices, cwd: sessionCwdRef.current, width: safeTermWidth, height: safeTermHeight, escapeAction: sessionIdRef.current ? "cancel" : "new session", onSelect: handleSessionChoice, onCancel: handleSessionChoiceCancelled }) }));
    }
    if (needsOnboarding && clientRef.current) {
        return (_jsx(Box, { flexDirection: "column", width: safeTermWidth, height: safeTermHeight, children: _jsx(Onboarding, { client: clientRef.current, width: safeTermWidth, height: safeTermHeight, onComplete: handleOnboardingComplete }) }));
    }
    if (overlay && overlay.screen === "diff") {
        return (_jsx(DiffViewer, { content: overlay.content, truncated: overlay.truncated, width: safeTermWidth, height: safeTermHeight, onClose: () => setOverlay(null) }));
    }
    if (overlay && clientRef.current && sessionIdRef.current) {
        if (overlay.screen === "configure") {
            const intent = overlay.intent;
            return (_jsx(Box, { flexDirection: "column", width: safeTermWidth, height: safeTermHeight, children: _jsx(ConfigureScreen, { client: clientRef.current, sessionId: sessionIdRef.current, width: safeTermWidth, height: safeTermHeight, onComplete: () => {
                        setOverlay(null);
                        setStatus("ready");
                    }, onCancel: () => setOverlay(null), initialIntent: intent }) }));
        }
        else if (overlay.screen === "extensions") {
            return (_jsx(Box, { flexDirection: "column", width: safeTermWidth, height: safeTermHeight, children: _jsx(ExtensionsManager, { client: clientRef.current, sessionId: sessionIdRef.current, height: safeTermHeight, onClose: () => setOverlay(null) }) }));
        }
    }
    return (_jsxs(Box, { flexDirection: "column", width: safeTermWidth, height: safeTermHeight, paddingX: PAD_X, paddingTop: PAD_TOP, paddingBottom: PAD_BOTTOM, children: [bannerVisible ? (_jsx(SplashScreen, { animFrame: gooseFrame, width: contentWidth, height: Math.max(safeTermHeight - PAD_TOP - PAD_BOTTOM - inputAreaH, 0), status: status, loading: loading, spinIdx: spinIdx, cwd: CWD_DISPLAY })) : (_jsxs(_Fragment, { children: [_jsx(Header, { width: contentWidth, status: status, loading: loading, spinIdx: spinIdx, providerId: defaults.providerId, modelId: defaults.modelId, turnInfo: turns.length > 1
                            ? { current: effectiveTurnIdx + 1, total: turns.length }
                            : undefined }), toolCallExpanded && selectedToolCallInfo ? (_jsx(ToolCallExpanded, { info: selectedToolCallInfo, width: contentWidth, height: viewportHeight, scrollOffset: toolCallExpandedScroll, onScroll: setToolCallExpandedScroll, onClose: () => {
                            setToolCallExpanded(false);
                            setToolCallExpandedScroll(0);
                        } })) : (_jsx(Viewport, { lines: contentLines, height: viewportHeight, width: contentWidth, scrollOffset: scrollOffset })), isViewingHistory && (_jsxs(Box, { flexDirection: "column", width: contentWidth, flexShrink: 0, children: [_jsx(Rule, { width: contentWidth }), _jsxs(Box, { justifyContent: "center", width: contentWidth, children: [_jsxs(Text, { color: GOLD, children: ["turn ", effectiveTurnIdx + 1, "/", turns.length] }), _jsx(Text, { color: TEXT_DIM, children: " \u2014 shift+\u2193 to return" })] })] }))] })), inputGapH > 0 && _jsx(Box, { height: inputGapH, flexShrink: 0 }), usageBarH > 0 && usage !== null && (_jsx(ContextBar, { used: usage.used, size: usage.size, width: contentWidth, marginTop: 0 })), autocompleteReservedH > 0 && (_jsx(AutocompletePopover, { width: contentWidth, visibleRows: autocompleteVisibleRows, items: autocomplete.items, highlightedIndex: autocomplete.highlightedIndex, loading: autocomplete.loading, errored: autocomplete.errored, emptyLabel: autocomplete.emptyLabel })), showInputBar && (_jsx(InputBar, { width: contentWidth, input: input, onChange: setInput, onSubmit: handleSubmit, queued: queuedMessages.length > 0, scrollHint: showScrollHint, placeholder: bannerVisible ? INITIAL_GREETING : undefined, 
                // Ink runs every active handler for the same keypress, so while the
                // expanded view is open the editor must not also see the space that
                // closes it — it would land in the buffer.
                focused: showInputBar && !toolCallExpanded, pastedFull: pastedFull, onPastedFullChange: setPastedFull, knownCommands: knownCommandNames, spaceReserved: selectedToolCallIdx !== null, arrowsReserved: autocomplete.open, returnReserved: autocomplete.swallowReturn }))] }));
}
const cli = meow(`
  Usage
    $ goose

  Options
    --server, -s  Server URL (default: auto-launch bundled server)
    --text, -t    Send a single prompt and exit
    --resume, -r  Resume a session from this directory (pick one, or pass its id)
`, {
    importMeta: import.meta,
    flags: {
        server: { type: "string", shortFlag: "s" },
        text: { type: "string", shortFlag: "t" },
        resume: { type: "string", shortFlag: "r" },
    },
});
let serverProcess = null;
async function runTextMode(serverConnection, prompt, resumeSessionId) {
    try {
        // Loading a session replays its history through the same notification the
        // answer arrives on; only the answer belongs on stdout.
        let replaying = false;
        const client = new GooseClient(() => ({
            requestPermission: async (params) => {
                const optionId = params.options?.[0]?.optionId ?? "approve";
                return {
                    outcome: {
                        outcome: "selected",
                        optionId,
                    },
                };
            },
            sessionUpdate: async (params) => {
                const update = params.update;
                if (update.sessionUpdate === "agent_message_chunk" && !replaying) {
                    if (update.content.type === "text") {
                        process.stdout.write(update.content.text);
                    }
                }
            },
        }), serverConnection);
        await client.initialize({
            protocolVersion: PROTOCOL_VERSION,
            clientInfo: { name: "goose-text", version: "0.1.0" },
            clientCapabilities: {},
        });
        const cwd = process.cwd();
        let sessionId;
        if (resumeSessionId) {
            replaying = true;
            await client.loadSession({
                sessionId: resumeSessionId,
                cwd,
                mcpServers: [],
            });
            replaying = false;
            sessionId = resumeSessionId;
        }
        else {
            const session = await client.newSession({ cwd, mcpServers: [] });
            sessionId = session.sessionId;
        }
        await client.prompt({
            sessionId,
            prompt: [{ type: "text", text: prompt }],
        });
        process.stdout.write("\n");
    }
    catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`Error: ${errMsg}`);
        process.exit(1);
    }
}
async function main() {
    let serverConnection;
    if (cli.flags.server) {
        serverConnection = cli.flags.server;
    }
    else {
        const binary = resolveGooseBinary();
        serverProcess = spawn(binary, ["acp"], {
            stdio: ["pipe", "pipe", "ignore"],
            detached: false,
        });
        serverProcess.on("error", (err) => {
            console.error(`Failed to start goose acp: ${err.message}`);
            process.exit(1);
        });
        const output = Writable.toWeb(serverProcess.stdin);
        const input = Readable.toWeb(serverProcess.stdout);
        serverConnection = ndJsonStream(output, input);
    }
    // Text mode: bypass TUI and stream directly to stdout
    if (cli.flags.text) {
        if (cli.flags.resume === "") {
            console.error("--resume needs a session id when combined with --text");
            cleanup();
            process.exit(1);
        }
        await runTextMode(serverConnection, cli.flags.text, cli.flags.resume);
        cleanup();
        return;
    }
    // Interactive TUI mode
    const { waitUntilExit } = render(_jsx(App, { serverConnection: serverConnection, initialPrompt: cli.flags.text, resume: cli.flags.resume }), {
        // Ink tests for Ctrl+C in two places that disagree under the Kitty
        // protocol: it suppresses our handler on `input === "c" && ctrl`
        // (use-input.js) but only exits on the raw \x03 byte (App.js), which the
        // protocol never sends. Ctrl+C would fall between the two, so own it.
        exitOnCtrlC: false,
        // Without this a terminal cannot report Shift+Enter at all — it sends the
        // same byte as Enter — and Ctrl+M arrives as Return. Ink's auto-detection
        // only knows Kitty, WezTerm and Ghostty; iTerm2 has spoken the protocol
        // since 3.5, so ask it directly. Ink restores the previous mode on exit.
        kittyKeyboard: {
            mode: process.env["TERM_PROGRAM"] === "iTerm.app" ? "enabled" : "auto",
            // Stay on the default flag. Adding reportAllKeysAsEscapeCodes was tried
            // to make Shift+Enter reportable and broke the basics in iTerm2 —
            // shifted characters lost their case and Ctrl+C stopped quitting.
            // Shift+Enter is simply not reachable there; Ctrl+Enter is the newline.
        },
    });
    await waitUntilExit();
    cleanup();
}
function cleanup() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
    }
}
process.on("exit", cleanup);
process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
});
process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
});
main().catch((err) => {
    console.error(err);
    cleanup();
    process.exit(1);
});
