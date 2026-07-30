import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { CRANBERRY, TEAL, GOLD, TEXT_PRIMARY, TEXT_DIM, RULE_COLOR, } from "./colors.js";
import { Spinner, SPINNER_FRAMES } from "./components/Spinner.js";
import { ErrorScreen } from "./components/ErrorScreen.js";
import { ProviderSelector, ProviderConfigurator } from "./onboarding.js";
const LOAD_MODELS_TIMEOUT_MS = 30000;
const ModelSelector = React.memo(function ModelSelector({ provider, height, onSelect, onBack, }) {
    const [loading, setLoading] = useState(true);
    const [models, setModels] = useState([]);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [manualEntry, setManualEntry] = useState(false);
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;
    useEffect(() => {
        const availableModels = provider.models.map((model) => model.id);
        setModels(availableModels);
        const defaultIdx = availableModels.findIndex((model) => model === provider.defaultModel);
        setSelectedIdx(defaultIdx >= 0 ? defaultIdx : 0);
        setLoading(false);
    }, [provider.models, provider.defaultModel]);
    const filtered = (() => {
        if (!searchQuery)
            return models;
        const q = searchQuery.toLowerCase();
        return models.filter((m) => m.toLowerCase().includes(q));
    })();
    const maxWidth = Math.min(columns - 4, 80);
    const HEADER_HEIGHT = 2;
    const SEARCH_BOX_HEIGHT = 3;
    const FOOTER_HEIGHT = 3;
    const CHROME_HEIGHT = HEADER_HEIGHT + SEARCH_BOX_HEIGHT + FOOTER_HEIGHT + 4;
    const listHeight = Math.max(height - CHROME_HEIGHT, 3);
    const [scrollOffset, setScrollOffset] = useState(0);
    useEffect(() => {
        if (selectedIdx < scrollOffset) {
            setScrollOffset(selectedIdx);
        }
        else if (selectedIdx >= scrollOffset + listHeight) {
            setScrollOffset(selectedIdx - listHeight + 1);
        }
    }, [selectedIdx, scrollOffset, listHeight]);
    useInput((ch, key) => {
        if (key.escape) {
            if (manualEntry) {
                setManualEntry(false);
                setSearchQuery("");
                return;
            }
            if (searchQuery) {
                setSearchQuery("");
                setSelectedIdx(0);
                setScrollOffset(0);
                return;
            }
            onBack();
            return;
        }
        if (manualEntry) {
            if (key.return) {
                if (searchQuery.trim()) {
                    onSelect(searchQuery.trim());
                }
                return;
            }
            if (key.backspace || key.delete) {
                setSearchQuery((q) => q.slice(0, -1));
                return;
            }
            if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
                setSearchQuery((q) => q + ch);
            }
            return;
        }
        if (key.upArrow) {
            setSelectedIdx((i) => Math.max(i - 1, 0));
            return;
        }
        if (key.downArrow) {
            setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
            return;
        }
        if (key.return) {
            const m = filtered[selectedIdx];
            if (m)
                onSelect(m);
            return;
        }
        if (key.backspace || key.delete) {
            setSearchQuery((q) => q.slice(0, -1));
            setSelectedIdx(0);
            setScrollOffset(0);
            return;
        }
        if (ch === "m" && !searchQuery) {
            setManualEntry(true);
            return;
        }
        if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
            setSearchQuery((q) => q + ch);
            setSelectedIdx(0);
            setScrollOffset(0);
        }
    });
    if (loading) {
        return (_jsxs(Box, { flexDirection: "column", height: height, width: columns, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Select model \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsxs(Text, { color: TEXT_DIM, children: ["Loading models for ", provider.providerName, "\u2026"] }) }), _jsx(Box, { justifyContent: "center", flexGrow: 1, alignItems: "center", children: _jsx(Spinner, { idx: 0 }) })] }));
    }
    if (models.length === 0) {
        return (_jsxs(Box, { flexDirection: "column", height: height, width: columns, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Select model \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: GOLD, children: "\u26A0 No models available" }) }), _jsx(Box, { justifyContent: "center", children: _jsx(Box, { width: maxWidth, children: _jsx(Text, { color: TEXT_DIM, wrap: "wrap", children: "This provider does not currently expose any models in inventory." }) }) }), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsx(Text, { color: TEXT_DIM, children: "m manual entry \u00B7 esc back" }) })] }));
    }
    if (manualEntry) {
        const inputWidth = Math.min(60, maxWidth - 4);
        const displayText = searchQuery || "type model name…";
        const truncatedText = displayText.length > inputWidth - 6
            ? displayText.slice(0, inputWidth - 9) + "…"
            : displayText;
        return (_jsxs(Box, { flexDirection: "column", height: height, width: columns, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Enter model name \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsxs(Text, { color: TEXT_DIM, children: ["Type a model identifier for ", provider.providerName] }) }), _jsx(Box, { justifyContent: "center", children: _jsxs(Box, { borderStyle: "round", borderColor: GOLD, paddingX: 2, width: inputWidth, children: [_jsx(Text, { color: GOLD, bold: true, children: "❯ " }), _jsx(Text, { color: searchQuery ? TEXT_PRIMARY : TEXT_DIM, children: truncatedText })] }) }), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsx(Text, { color: TEXT_DIM, children: "enter confirm \u00B7 esc cancel" }) })] }));
    }
    const visible = filtered.slice(scrollOffset, scrollOffset + listHeight);
    const searchBoxWidth = Math.min(60, maxWidth - 4);
    return (_jsxs(Box, { flexDirection: "column", height: height, width: columns, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Select model \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsxs(Text, { color: TEXT_DIM, children: ["Choose a model for ", provider.providerName] }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsxs(Box, { borderStyle: "round", borderColor: RULE_COLOR, paddingX: 2, width: searchBoxWidth, children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "❯ " }), _jsx(Box, { width: searchBoxWidth - 8, children: _jsx(Text, { color: searchQuery ? TEXT_PRIMARY : TEXT_DIM, wrap: "truncate", children: searchQuery || "search models…" }) })] }) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, justifyContent: "flex-start", children: filtered.length === 0 ? (_jsx(Box, { justifyContent: "center", alignItems: "center", height: Math.max(listHeight, 1), children: _jsx(Text, { color: TEXT_DIM, children: "No matching models" }) })) : (_jsxs(_Fragment, { children: [scrollOffset > 0 && (_jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsxs(Text, { color: TEXT_DIM, children: ["\u25B2 ", scrollOffset, " more above"] }) })), _jsx(Box, { justifyContent: "center", children: _jsx(Box, { flexDirection: "column", width: maxWidth, children: visible.map((model, vi) => {
                                    const idx = vi + scrollOffset;
                                    const active = idx === selectedIdx;
                                    const isDefault = model === provider.defaultModel;
                                    const modelWidth = maxWidth - 8;
                                    const truncatedModel = model.length > modelWidth
                                        ? model.slice(0, modelWidth - 1) + "…"
                                        : model;
                                    return (_jsxs(Box, { children: [_jsx(Text, { color: active ? GOLD : TEXT_DIM, children: active ? "▸ " : "  " }), _jsx(Text, { color: active ? TEXT_PRIMARY : TEXT_DIM, bold: active, children: truncatedModel }), isDefault && _jsx(Text, { color: TEAL, children: " (default)" })] }, model));
                                }) }) }), scrollOffset + listHeight < filtered.length && (_jsx(Box, { justifyContent: "center", marginTop: 1, children: _jsxs(Text, { color: TEXT_DIM, children: ["\u25BC ", filtered.length - scrollOffset - listHeight, " more below"] }) }))] })) }), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsx(Text, { color: TEXT_DIM, children: "\u2191\u2193 navigate \u00B7 enter select \u00B7 m manual \u00B7 esc back" }) })] }));
});
export default function ConfigureScreen({ client, sessionId, width, height, onComplete, onCancel, initialIntent, }) {
    const [phase, setPhase] = useState("loading");
    const [providers, setProviders] = useState([]);
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [spinIdx, setSpinIdx] = useState(0);
    const [fetchKey, setFetchKey] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length), 300);
        return () => clearInterval(t);
    }, []);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resp = await client.goose.providersList_unstable({
                    providerIds: [],
                });
                if (cancelled)
                    return;
                const sorted = [...resp.entries].sort((a, b) => {
                    const aP = a.providerType === "Preferred" ? 0 : 1;
                    const bP = b.providerType === "Preferred" ? 0 : 1;
                    if (aP !== bP)
                        return aP - bP;
                    return a.providerName.localeCompare(b.providerName);
                });
                setProviders(sorted);
                if (initialIntent === "model") {
                    try {
                        const cfg = await client.goose.defaultsRead_unstable({});
                        if (cancelled)
                            return;
                        const current = sorted.find((p) => p.providerId === cfg.providerId);
                        if (current) {
                            setSelectedProvider(current);
                            setPendingConfigValues({});
                            setPhase("select_model");
                            return;
                        }
                    }
                    catch {
                        // fall through to provider selector
                    }
                }
                if (!cancelled)
                    setPhase("select_provider");
            }
            catch (e) {
                if (!cancelled) {
                    setErrorMsg(e instanceof Error ? e.message : String(e));
                    setPhase("error");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [client, fetchKey, initialIntent]);
    const applyProviderModel = useCallback(async (provider, model, configValues) => {
        setPhase("saving");
        try {
            await client.goose.providersConfigSave_unstable({
                providerId: provider.providerId,
                fields: Object.entries(configValues).map(([key, value]) => ({
                    key,
                    value,
                })),
            });
            await client.setSessionConfigOption({
                sessionId,
                configId: "provider",
                value: provider.providerId,
            });
            await client.setSessionConfigOption({
                sessionId,
                configId: "model",
                value: model,
            });
            onComplete();
        }
        catch (e) {
            setErrorMsg(e instanceof Error ? e.message : String(e));
            setPhase("error");
        }
    }, [client, sessionId, onComplete]);
    const [pendingConfigValues, setPendingConfigValues] = useState({});
    const handleProviderSelected = useCallback((provider) => {
        const keys = provider.configKeys.filter((k) => k.required && !k.oauthFlow && !k.deviceCodeFlow);
        setSelectedProvider(provider);
        if (keys.length > 0 && !provider.configured) {
            setPhase("configure");
        }
        else {
            setPendingConfigValues({});
            setPhase("select_model");
        }
    }, []);
    const handleConfigComplete = useCallback((values) => {
        if (!selectedProvider)
            return;
        setPendingConfigValues(values);
        setPhase("select_model");
    }, [selectedProvider]);
    const handleModelSelected = useCallback((model) => {
        if (!selectedProvider)
            return;
        applyProviderModel(selectedProvider, model, pendingConfigValues);
    }, [selectedProvider, pendingConfigValues, applyProviderModel]);
    const handleRetry = useCallback(() => {
        setErrorMsg("");
        setFetchKey((k) => k + 1);
        setPhase("loading");
    }, []);
    if (phase === "loading" || phase === "loading_models" || phase === "saving") {
        const label = phase === "loading"
            ? "Loading providers…"
            : phase === "loading_models"
                ? "Loading models…"
                : "Applying changes…";
        return (_jsxs(Box, { flexDirection: "column", height: height, width: width, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Configure provider \u25C6" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: TEXT_DIM, children: label }) }), _jsx(Box, { justifyContent: "center", flexGrow: 1, alignItems: "center", children: _jsx(Spinner, { idx: spinIdx }) })] }));
    }
    if (phase === "error") {
        return (_jsxs(Box, { flexDirection: "column", height: height, width: width, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: "\u25C6 Configure provider \u25C6" }) }), _jsx(ErrorScreen, { errorMsg: errorMsg, onRetry: handleRetry })] }));
    }
    if (phase === "configure" && selectedProvider) {
        return (_jsx(ProviderConfigurator, { provider: selectedProvider, height: height, onComplete: handleConfigComplete, onBack: () => {
                setSelectedProvider(null);
                setPhase("select_provider");
            } }));
    }
    if (phase === "select_model" && selectedProvider) {
        return (_jsx(ModelSelector, { provider: selectedProvider, height: height, onSelect: handleModelSelected, onBack: () => {
                if (initialIntent === "model") {
                    onCancel();
                }
                else {
                    setPhase("select_provider");
                }
            } }));
    }
    return (_jsx(ProviderSelector, { providers: providers, height: height, onSelect: handleProviderSelected, title: "\u25C6 Configure provider \u25C6", subtitle: "Select a provider and model for this session", onBack: onCancel }));
}
