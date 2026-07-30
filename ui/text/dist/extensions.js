import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { TextInput } from "@inkjs/ui";
import { CRANBERRY, GOLD, RULE_COLOR, TEAL, TEXT_DIM, TEXT_PRIMARY, } from "./colors.js";
import { Spinner, SPINNER_FRAMES } from "./components/Spinner.js";
import { ErrorScreen } from "./components/ErrorScreen.js";
function entryToExtEntry(entry) {
    const ext = entry.extension;
    if (ext.type !== "mcp") {
        return {
            enabled: entry.enabled,
            type: ext.type,
            name: ext.name,
            description: ext.description ?? "",
            display_name: ext.display_name ?? null,
            timeout: "timeout" in ext ? (ext.timeout ?? null) : null,
            bundled: ext.bundled ?? null,
        };
    }
    const server = ext.server;
    if ("type" in server && server.type === "sse")
        return null;
    const common = {
        enabled: entry.enabled,
        description: ext.description ?? "",
        env_keys: ext.envKeys ?? [],
        timeout: ext.timeout ?? null,
        bundled: ext.bundled ?? null,
    };
    if ("type" in server && server.type === "http") {
        return {
            ...common,
            type: "streamable_http",
            name: server.name,
            uri: server.url,
            headers: Object.fromEntries((server.headers ?? []).map((h) => [h.name, h.value])),
            socket: ext.socket ?? null,
        };
    }
    const stdio = server;
    return {
        ...common,
        type: "stdio",
        name: stdio.name,
        cmd: stdio.command,
        args: stdio.args,
    };
}
function toGooseExtension(e) {
    if (e.type === "streamable_http") {
        return {
            type: "mcp",
            server: { type: "http", name: e.name, url: String(e.uri ?? ""), headers: [] },
            description: e.description || undefined,
        };
    }
    return {
        type: "mcp",
        server: { name: e.name, command: String(e.cmd ?? ""), args: e.args ?? [], env: [] },
        description: e.description || undefined,
    };
}
function deriveNameFromValue(addType, value) {
    if (addType === "stdio") {
        const cmd = value.trim().split(/\s+/)[0] ?? "";
        return cmd.split("/").pop() ?? cmd;
    }
    try {
        return new URL(value.trim()).hostname;
    }
    catch {
        return value.trim();
    }
}
function buildConfig(addType, value, name, description) {
    if (addType === "stdio") {
        const parts = value.trim().split(/\s+/);
        return {
            type: "stdio",
            enabled: true,
            name,
            description,
            cmd: parts[0] ?? "",
            args: parts.slice(1),
        };
    }
    return {
        type: "streamable_http",
        enabled: true,
        name,
        description,
        uri: value.trim(),
    };
}
export default function ExtensionsManager({ client, sessionId, height, onClose, }) {
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;
    const [phase, setPhase] = useState("loading");
    const [spinIdx, setSpinIdx] = useState(0);
    const [errorMsg, setErrorMsg] = useState("");
    const [entries, setEntries] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [addType, setAddType] = useState("stdio");
    const [addValue, setAddValue] = useState("");
    const [addName, setAddName] = useState("");
    const [addDesc, setAddDesc] = useState("");
    const [inputKey, setInputKey] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length), 300);
        return () => clearInterval(t);
    }, []);
    const reload = useCallback(async () => {
        setPhase("loading");
        try {
            const [configResp, sessionResp] = await Promise.all([
                client.goose.configExtensionsList_unstable({}),
                client.goose.sessionExtensionsList_unstable({ sessionId }),
            ]);
            const allExtensions = configResp.extensions
                .map(entryToExtEntry)
                .filter((e) => e !== null);
            const activeNames = new Set(sessionResp.extensions.map((e) => e.name));
            setEntries(allExtensions.map((ext) => ({
                ...ext,
                enabled: activeNames.has(ext.name),
            })));
            setWarnings(configResp.warnings ?? []);
            setPhase("list");
        }
        catch (e) {
            setErrorMsg(e instanceof Error ? e.message : String(e));
            setPhase("error");
        }
    }, [client, sessionId]);
    useEffect(() => {
        reload();
    }, [reload]);
    const withSaving = useCallback(async (fn) => {
        setPhase("saving");
        try {
            await fn();
            await reload();
        }
        catch (e) {
            setErrorMsg(e instanceof Error ? e.message : String(e));
            setPhase("error");
        }
    }, [reload]);
    const toggleSelected = useCallback(() => {
        const sel = entries[selectedIdx];
        if (!sel)
            return;
        withSaving(async () => {
            if (sel.enabled) {
                await client.goose.sessionExtensionsRemove_unstable({
                    sessionId,
                    name: sel.name,
                });
            }
            else {
                await client.goose.sessionExtensionsAdd_unstable({
                    sessionId,
                    config: sel,
                });
            }
        });
    }, [entries, selectedIdx, client, sessionId, withSaving]);
    const saveNewExtension = useCallback((description) => {
        const config = buildConfig(addType, addValue, addName, description);
        withSaving(async () => {
            await client.goose.configExtensionsAdd_unstable({
                extension: toGooseExtension(config),
                enabled: true,
            });
            await client.goose.sessionExtensionsAdd_unstable({
                sessionId,
                config: config,
            });
        });
    }, [addType, addValue, addName, client, sessionId, withSaving]);
    useInput((ch, key) => {
        if (phase === "list") {
            if (key.escape) {
                onClose();
                return;
            }
            if (key.upArrow) {
                setSelectedIdx((i) => Math.max(i - 1, 0));
                return;
            }
            if (key.downArrow) {
                setSelectedIdx((i) => Math.min(i + 1, entries.length - 1));
                return;
            }
            if (ch === " " || key.return) {
                toggleSelected();
                return;
            }
            if (ch === "a") {
                setAddType("stdio");
                setPhase("add_type");
                return;
            }
        }
        if (phase === "add_type") {
            if (key.escape) {
                setPhase("list");
                return;
            }
            if (key.upArrow || key.downArrow) {
                setAddType((t) => (t === "stdio" ? "streamable_http" : "stdio"));
                return;
            }
            if (key.return) {
                setAddValue("");
                setInputKey((k) => k + 1);
                setPhase("add_value");
                return;
            }
        }
        if (key.escape) {
            if (phase === "add_value") {
                setPhase("add_type");
                return;
            }
            if (phase === "add_name") {
                setInputKey((k) => k + 1);
                setPhase("add_value");
                return;
            }
            if (phase === "add_desc") {
                setInputKey((k) => k + 1);
                setPhase("add_name");
                return;
            }
        }
    });
    if (phase === "loading" || phase === "saving") {
        return (_jsxs(Box, { flexDirection: "column", height: height, width: columns, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Manage extensions \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: TEXT_DIM, children: phase === "loading" ? "Loading extensions…" : "Saving…" }) }), _jsx(Box, { justifyContent: "center", flexGrow: 1, alignItems: "center", children: _jsx(Spinner, { idx: spinIdx }) })] }));
    }
    if (phase === "error") {
        return (_jsxs(Box, { flexDirection: "column", height: height, width: columns, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Manage extensions \u25C6" }) }), _jsx(ErrorScreen, { errorMsg: errorMsg, onRetry: () => reload() })] }));
    }
    const maxW = Math.min(columns - 4, 80);
    const inputW = Math.min(maxW - 10, 70);
    if (phase === "add_type") {
        const types = [
            { value: "stdio", label: "Command (stdio)", hint: "run a local command" },
            {
                value: "streamable_http",
                label: "Endpoint (HTTP)",
                hint: "connect to a remote server",
            },
        ];
        return (_jsxs(Box, { flexDirection: "column", width: columns, height: height, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Add extension \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: TEXT_DIM, children: "Choose a connection type" }) }), _jsx(Box, { justifyContent: "center", children: _jsx(Box, { flexDirection: "column", children: types.map((t) => {
                            const active = addType === t.value;
                            return (_jsxs(Box, { children: [_jsx(Text, { color: active ? GOLD : TEXT_DIM, children: active ? "▸ " : "  " }), _jsx(Text, { color: active ? TEXT_PRIMARY : TEXT_DIM, bold: active, children: t.label }), _jsxs(Text, { color: TEXT_DIM, children: [" ", t.hint] })] }, t.value));
                        }) }) }), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsx(Text, { color: TEXT_DIM, children: "\u2191\u2193 select \u00B7 enter confirm \u00B7 esc cancel" }) })] }));
    }
    if (phase === "add_value") {
        const isStdio = addType === "stdio";
        const placeholder = isStdio
            ? "npx -y @modelcontextprotocol/server-filesystem /tmp"
            : "http://localhost:8080/mcp";
        return (_jsxs(Box, { flexDirection: "column", width: columns, height: height, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsxs(Text, { color: TEXT_PRIMARY, bold: true, children: ["\u25C6 ", isStdio ? "Enter command" : "Enter endpoint URL", " \u25C6"] }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: TEXT_DIM, children: isStdio
                            ? "The command to launch the extension"
                            : "URL of the remote MCP server" }) }), _jsx(Box, { justifyContent: "center", children: _jsxs(Box, { borderStyle: "round", borderColor: RULE_COLOR, paddingX: 2, width: inputW, children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "❯ " }), _jsx(TextInput, { placeholder: placeholder, onChange: setAddValue, onSubmit: (v) => {
                                    if (!v.trim())
                                        return;
                                    setAddValue(v);
                                    setAddName(deriveNameFromValue(addType, v));
                                    setInputKey((k) => k + 1);
                                    setPhase("add_name");
                                } }, `value-${inputKey}`)] }) }), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsx(Text, { color: TEXT_DIM, children: "enter continue \u00B7 esc back" }) })] }));
    }
    if (phase === "add_name") {
        return (_jsxs(Box, { flexDirection: "column", width: columns, height: height, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Name this extension \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: TEXT_DIM, children: "A short name to identify this extension" }) }), _jsx(Box, { justifyContent: "center", children: _jsxs(Box, { borderStyle: "round", borderColor: RULE_COLOR, paddingX: 2, width: inputW, children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "❯ " }), _jsx(TextInput, { defaultValue: addName, placeholder: "extension name", onChange: setAddName, onSubmit: (v) => {
                                    if (!v.trim())
                                        return;
                                    setAddName(v.trim());
                                    setAddDesc("");
                                    setInputKey((k) => k + 1);
                                    setPhase("add_desc");
                                } }, `name-${inputKey}`)] }) }), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsx(Text, { color: TEXT_DIM, children: "enter continue \u00B7 esc back" }) })] }));
    }
    if (phase === "add_desc") {
        return (_jsxs(Box, { flexDirection: "column", width: columns, height: height, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Description \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: TEXT_DIM, children: "What does this extension do? (optional)" }) }), _jsx(Box, { justifyContent: "center", children: _jsxs(Box, { borderStyle: "round", borderColor: RULE_COLOR, paddingX: 2, width: inputW, children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "❯ " }), _jsx(TextInput, { placeholder: "what does this extension do?", onChange: setAddDesc, onSubmit: (v) => saveNewExtension(v.trim()) }, `desc-${inputKey}`)] }) }), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsx(Text, { color: TEXT_DIM, children: "enter save (leave empty to skip) \u00B7 esc back" }) })] }));
    }
    const layoutW = maxW;
    const GUTTER = 2;
    const STATUS_W = 10;
    const nameW = Math.max(16, Math.floor(layoutW * 0.3));
    const descW = Math.max(8, layoutW - 2 - STATUS_W - nameW - 2 * GUTTER);
    const rows = Math.max(height - 9, 4);
    const maxStart = Math.max(0, entries.length - rows);
    const start = Math.min(maxStart, Math.max(0, selectedIdx - Math.floor(rows / 2)));
    const end = Math.min(entries.length, start + rows);
    const windowed = entries.slice(start, end);
    return (_jsxs(Box, { flexDirection: "column", width: columns, height: height, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Manage extensions \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: TEXT_DIM, children: "Toggle, add, or remove extensions for this session" }) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, justifyContent: "flex-start", children: entries.length === 0 ? (_jsx(Box, { justifyContent: "center", alignItems: "center", height: Math.max(rows - 1, 1), children: _jsx(Text, { color: TEXT_DIM, children: "No extensions configured \u2014 press a to add one" }) })) : (_jsxs(_Fragment, { children: [start > 0 && (_jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsxs(Text, { color: TEXT_DIM, children: ["\u25B2 ", start, " more above"] }) })), _jsx(Box, { justifyContent: "center", children: _jsx(Box, { flexDirection: "column", width: layoutW, children: windowed.map((ext, i) => {
                                    const globalIdx = start + i;
                                    const active = globalIdx === selectedIdx;
                                    return (_jsxs(Box, { width: layoutW, children: [_jsx(Text, { color: active ? GOLD : TEXT_DIM, children: active ? "▸ " : "  " }), _jsx(Box, { width: nameW, children: _jsx(Text, { color: active ? TEXT_PRIMARY : TEXT_DIM, bold: active, wrap: "truncate", children: ext.name }) }), _jsx(Box, { width: GUTTER, children: _jsx(Text, { children: " ".repeat(GUTTER) }) }), _jsx(Box, { width: descW, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate", children: ext.description || "" }) }), _jsx(Box, { width: GUTTER, children: _jsx(Text, { children: " ".repeat(GUTTER) }) }), _jsx(Box, { width: STATUS_W, children: _jsx(Text, { color: ext.enabled ? TEAL : TEXT_DIM, wrap: "truncate", children: ext.enabled ? "enabled" : "disabled" }) })] }, `${ext.type}:${ext.name}`));
                                }) }) }), end < entries.length && (_jsx(Box, { justifyContent: "center", marginTop: 1, children: _jsxs(Text, { color: TEXT_DIM, children: ["\u25BC ", entries.length - end, " more below"] }) }))] })) }), warnings.length > 0 && (_jsx(Box, { justifyContent: "center", marginTop: 1, children: _jsxs(Box, { width: layoutW, flexDirection: "column", children: [_jsx(Text, { color: GOLD, children: "Warnings" }), warnings.map((w, i) => (_jsx(Box, { width: layoutW, children: _jsxs(Text, { color: TEXT_DIM, wrap: "truncate", children: ["\u2022 ", w] }) }, i)))] }) })), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsx(Text, { color: TEXT_DIM, children: "space/enter toggle \u00B7 a add \u00B7 esc back" }) })] }));
}
