import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { TextInput, PasswordInput } from "@inkjs/ui";
import { CRANBERRY, TEAL, GOLD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_DIM, RULE_COLOR, } from "./colors.js";
import { Spinner, SPINNER_FRAMES } from "./components/Spinner.js";
import { ErrorScreen } from "./components/ErrorScreen.js";
export const ProviderSelector = React.memo(function ProviderSelector({ providers, height, onSelect, title, subtitle, onBack, }) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;
    const filtered = (() => {
        if (!searchQuery)
            return providers;
        const q = searchQuery.toLowerCase();
        return providers.filter((p) => p.providerName.toLowerCase().includes(q) ||
            p.providerId.toLowerCase().includes(q));
    })();
    // Calculate grid dimensions based on terminal size
    const cardWidth = 36; // Width of each provider card
    const cardHeight = 8; // Height of each provider card
    const minSpacing = 2; // Minimum spacing between cards
    const availableWidth = columns - 4; // Leave margins
    // Header: marginTop(1) + title+mb(2) + subtitle+mb(3) + searchbar+mb(5) = 11
    // Footer: mt(2) + text(1) = 3, plus potential scroll indicators(2)
    const availableHeight = height - 16;
    const cardsPerRow = Math.max(1, Math.floor(availableWidth / (cardWidth + minSpacing)));
    // Cap horizontal gap so it doesn't grow unbounded on wide terminals
    const columnSpacing = Math.min(minSpacing, Math.floor((availableWidth - cardsPerRow * cardWidth) / Math.max(1, cardsPerRow - 1)));
    // Terminal chars are ~2× taller than wide, so 1 row ≈ 2 columns visually
    const rowSpacing = 1;
    const rowsVisible = Math.max(1, Math.floor((availableHeight + rowSpacing) / (cardHeight + rowSpacing)));
    const totalRows = Math.ceil(filtered.length / cardsPerRow);
    const selectedRow = Math.floor(selectedIdx / cardsPerRow);
    // Calculate scroll offset for rows
    const [scrollRow, setScrollRow] = useState(0);
    useEffect(() => {
        if (selectedRow < scrollRow) {
            setScrollRow(selectedRow);
        }
        else if (selectedRow >= scrollRow + rowsVisible) {
            setScrollRow(selectedRow - rowsVisible + 1);
        }
    }, [selectedRow, rowsVisible, scrollRow]);
    useInput((ch, key) => {
        if (key.escape) {
            if (searchQuery) {
                setSearchQuery("");
                setSelectedIdx(0);
                setScrollRow(0);
                return;
            }
            if (onBack) {
                onBack();
                return;
            }
        }
        if (filtered.length === 0) {
            // Only allow typing/backspace when no results match; skip navigation
            if (key.backspace || key.delete) {
                setSearchQuery((q) => q.slice(0, -1));
                setSelectedIdx(0);
                setScrollRow(0);
                return;
            }
            if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
                setSearchQuery((q) => q + ch);
                setSelectedIdx(0);
                setScrollRow(0);
            }
            return;
        }
        if (key.upArrow) {
            const newIdx = Math.max(selectedIdx - cardsPerRow, 0);
            setSelectedIdx(newIdx);
            return;
        }
        if (key.downArrow) {
            const newIdx = Math.min(selectedIdx + cardsPerRow, filtered.length - 1);
            setSelectedIdx(newIdx);
            return;
        }
        if (key.leftArrow) {
            const newIdx = Math.max(selectedIdx - 1, 0);
            setSelectedIdx(newIdx);
            return;
        }
        if (key.rightArrow) {
            const newIdx = Math.min(selectedIdx + 1, filtered.length - 1);
            setSelectedIdx(newIdx);
            return;
        }
        if (key.return) {
            const p = filtered[selectedIdx];
            if (p)
                onSelect(p);
            return;
        }
        if (key.backspace || key.delete) {
            setSearchQuery((q) => q.slice(0, -1));
            setSelectedIdx(0);
            setScrollRow(0);
            return;
        }
        if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
            setSearchQuery((q) => q + ch);
            setSelectedIdx(0);
            setScrollRow(0);
        }
    });
    // Create grid of provider cards
    const renderProviderCard = (provider, _index, isSelected) => {
        const cardBorder = isSelected ? "double" : "single";
        const cardBorderColor = isSelected ? GOLD : RULE_COLOR;
        const textColor = isSelected ? TEXT_PRIMARY : TEXT_SECONDARY;
        // Calculate actual content width: cardWidth - borders (2) - paddingX (2)
        const contentWidth = cardWidth - 4;
        // Width for title (leave space for icons: 2-3 chars)
        const titleWidth = contentWidth - 3;
        // Available lines for description: cardHeight - borders (2) - title (1) - margin (1) - name (1) - margin (1)
        const descriptionMaxLines = Math.max(1, cardHeight - 6);
        const descriptionMaxChars = descriptionMaxLines * contentWidth;
        return (_jsxs(Box, { width: cardWidth, height: cardHeight, borderStyle: cardBorder, borderColor: cardBorderColor, paddingX: 1, paddingY: 0, flexDirection: "column", children: [_jsxs(Box, { justifyContent: "space-between", alignItems: "center", children: [_jsx(Box, { width: titleWidth, flexShrink: 1, children: _jsx(Text, { color: textColor, bold: isSelected, wrap: "truncate", children: provider.providerName }) }), _jsxs(Box, { flexShrink: 0, children: [provider.providerType === "Preferred" && (_jsx(Text, { color: TEAL, children: "\u2605" })), provider.configured && _jsx(Text, { color: TEAL, children: "\u2713" })] })] }), _jsxs(Box, { marginTop: 1, flexDirection: "column", flexGrow: 1, children: [_jsx(Box, { width: contentWidth, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate", children: provider.providerId }) }), provider.description && (_jsx(Box, { marginTop: 1, width: contentWidth, children: _jsx(Text, { color: TEXT_DIM, wrap: "truncate", dimColor: true, children: provider.description.length > descriptionMaxChars
                                    ? provider.description.slice(0, descriptionMaxChars - 1) + "…"
                                    : provider.description }) }))] })] }, provider.providerId));
    };
    const visibleRows = [];
    for (let row = scrollRow; row < Math.min(scrollRow + rowsVisible, totalRows); row++) {
        const rowProviders = [];
        for (let col = 0; col < cardsPerRow; col++) {
            const index = row * cardsPerRow + col;
            if (index < filtered.length) {
                const isSelected = index === selectedIdx;
                rowProviders.push(renderProviderCard(filtered[index], index, isSelected));
            }
        }
        if (rowProviders.length > 0) {
            const isLastVisibleRow = row === Math.min(scrollRow + rowsVisible, totalRows) - 1;
            visibleRows.push(_jsx(Box, { gap: columnSpacing, marginBottom: isLastVisibleRow ? 0 : rowSpacing, children: rowProviders }, row));
        }
    }
    return (_jsxs(Box, { flexDirection: "column", height: height, width: columns, paddingX: 2, children: [_jsx(Box, { marginTop: 1 }), _jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Text, { color: TEXT_PRIMARY, bold: true, children: title ?? "◆ Welcome to goose ◆" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsx(Text, { color: TEXT_DIM, children: subtitle ?? "Connect an AI model provider to get started" }) }), _jsx(Box, { justifyContent: "center", marginBottom: 2, children: _jsxs(Box, { borderStyle: "round", borderColor: RULE_COLOR, paddingX: 2, width: Math.min(60, availableWidth), children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "❯ " }), _jsx(Text, { color: searchQuery ? TEXT_PRIMARY : TEXT_DIM, wrap: "truncate", children: searchQuery || "search providers…" })] }) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, justifyContent: "flex-start", children: filtered.length === 0 ? (_jsx(Box, { justifyContent: "center", alignItems: "center", height: 10, children: _jsx(Text, { color: TEXT_DIM, children: "No matching providers found" }) })) : (_jsxs(_Fragment, { children: [scrollRow > 0 && (_jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsxs(Text, { color: TEXT_DIM, children: ["\u25B2 ", scrollRow * cardsPerRow, " more above"] }) })), _jsx(Box, { justifyContent: "center", children: _jsx(Box, { flexDirection: "column", children: visibleRows }) }), scrollRow + rowsVisible < totalRows && (_jsx(Box, { justifyContent: "center", marginTop: 1, children: _jsxs(Text, { color: TEXT_DIM, children: ["\u25BC ", filtered.length - (scrollRow + rowsVisible) * cardsPerRow, " ", "more below"] }) }))] })) }), _jsx(Box, { justifyContent: "center", marginTop: 2, children: _jsxs(Text, { color: TEXT_DIM, children: ["\u2191\u2193\u2190\u2192 navigate \u00B7 enter select \u00B7 type to search", onBack ? " · esc back" : " · esc clear"] }) })] }));
});
export const ProviderConfigurator = React.memo(function ProviderConfigurator({ provider, height, onComplete, onBack, }) {
    const [keyValues, setKeyValues] = useState({});
    const [activeKeyIdx, setActiveKeyIdx] = useState(0);
    const [showMasked, setShowMasked] = useState({});
    const [inputKey, setInputKey] = useState(0);
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;
    const keys = provider.configKeys.filter((k) => k.required && !k.oauthFlow && !k.deviceCodeFlow);
    const currentKey = keys[activeKeyIdx];
    useInput((_ch, key) => {
        if (!currentKey)
            return;
        if (key.escape) {
            onBack();
            return;
        }
        if (key.tab && currentKey.secret) {
            setShowMasked((prev) => ({
                ...prev,
                [currentKey.name]: !prev[currentKey.name],
            }));
            return;
        }
    });
    const handleSubmit = (value) => {
        if (!currentKey)
            return;
        const effective = value.trim() || currentVal.trim();
        if (!effective)
            return;
        const newValues = { ...keyValues, [currentKey.name]: effective };
        setKeyValues(newValues);
        if (activeKeyIdx < keys.length - 1) {
            setActiveKeyIdx(activeKeyIdx + 1);
            setShowMasked({});
            setInputKey((prev) => prev + 1); // Force new input component
        }
        else {
            onComplete(newValues);
        }
    };
    const handleChange = (value) => {
        if (!currentKey)
            return;
        setKeyValues((prev) => ({
            ...prev,
            [currentKey.name]: value,
        }));
    };
    const currentVal = keyValues[currentKey?.name ?? ""] ?? "";
    const masked = currentKey?.secret && !showMasked[currentKey?.name ?? ""];
    const maxWidth = Math.min(columns - 4, 80);
    // Calculate content height for proper centering
    const headerHeight = 1 + (provider.description ? 2 : 0) + 1; // title + description + spacer
    const keysHeight = keys.length; // one line per key
    const inputHeight = currentKey ? 3 : 0; // input + help text + spacing
    const setupStepsHeight = provider.setupSteps?.length
        ? provider.setupSteps.length + 1
        : 0;
    const contentHeight = headerHeight + keysHeight + inputHeight + setupStepsHeight;
    const topPad = Math.max(0, Math.floor((height - contentHeight) / 2));
    return (_jsxs(Box, { flexDirection: "column", height: height, alignItems: "center", width: columns, children: [topPad > 0 && _jsx(Box, { height: topPad }), _jsxs(Box, { flexDirection: "column", width: maxWidth, paddingX: 2, children: [_jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsxs(Text, { color: TEXT_PRIMARY, bold: true, children: ["\u25C6 Configure ", provider.providerName, " \u25C6"] }) }), provider.description && (_jsx(Box, { justifyContent: "center", marginBottom: 1, children: _jsx(Box, { width: maxWidth - 4, children: _jsx(Text, { color: TEXT_DIM, wrap: "wrap", children: provider.description }) }) })), _jsx(Box, { marginTop: 1 }), keys.map((k, i) => (_jsxs(Box, { marginBottom: 1, children: [_jsx(Text, { color: i === activeKeyIdx ? GOLD : TEXT_DIM, children: i < activeKeyIdx ? "✓ " : i === activeKeyIdx ? "▸ " : "  " }), _jsx(Text, { color: i === activeKeyIdx ? TEXT_PRIMARY : TEXT_DIM, bold: i === activeKeyIdx, children: k.name }), i < activeKeyIdx && _jsx(Text, { color: TEAL, children: " \u2022\u2022\u2022\u2022\u2022\u2022" })] }, k.name))), currentKey && (_jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsxs(Box, { children: [_jsx(Text, { color: CRANBERRY, bold: true, children: "❯ " }), masked ? (_jsx(PasswordInput, { placeholder: currentKey.name, onChange: handleChange, onSubmit: handleSubmit }, `password-${currentKey.name}-${inputKey}`)) : (_jsx(TextInput, { defaultValue: currentVal, placeholder: currentKey.name, onChange: handleChange, onSubmit: handleSubmit }, `text-${currentKey.name}-${inputKey}`))] }), _jsx(Box, { marginTop: 1, children: _jsx(Box, { width: maxWidth - 4, children: _jsxs(Text, { color: TEXT_DIM, wrap: "wrap", children: ["enter confirm \u00B7 esc back", currentKey.secret && (_jsxs(_Fragment, { children: [" · tab ", masked ? "reveal" : "hide"] }))] }) }) })] })), provider.setupSteps && provider.setupSteps.length > 0 && (_jsxs(Box, { marginTop: 2, flexDirection: "column", children: [_jsx(Text, { color: TEXT_DIM, children: "Setup steps:" }), provider.setupSteps.map((step, i) => (_jsx(Box, { width: maxWidth - 4, marginTop: 1, children: _jsxs(Text, { color: TEXT_DIM, wrap: "wrap", children: [i + 1, ". ", step] }) }, i)))] }))] })] }));
});
const SuccessScreen = React.memo(function SuccessScreen({ provider, height, }) {
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;
    // Calculate content height for proper centering
    const contentHeight = 1 + (provider ? 1 : 0); // success message + provider text
    const topPad = Math.max(0, Math.floor((height - contentHeight) / 2));
    return (_jsxs(Box, { flexDirection: "column", alignItems: "center", width: columns, height: height, overflow: "hidden", children: [topPad > 0 && _jsx(Box, { height: topPad }), _jsxs(Box, { flexDirection: "column", alignItems: "center", children: [_jsx(Text, { color: TEAL, bold: true, children: "\u2713 Provider configured" }), provider && (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: TEXT_SECONDARY, children: ["Connected to ", provider.providerName] }) }))] })] }));
});
export default function Onboarding({ client, width, height, onComplete, }) {
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
        (async () => {
            try {
                const resp = await client.goose.providersList_unstable({
                    providerIds: [],
                });
                const sorted = [...resp.entries].sort((a, b) => {
                    const aP = a.providerType === "Preferred" ? 0 : 1;
                    const bP = b.providerType === "Preferred" ? 0 : 1;
                    if (aP !== bP)
                        return aP - bP;
                    return a.providerName.localeCompare(b.providerName);
                });
                setProviders(sorted);
                setPhase("select_provider");
            }
            catch (e) {
                setErrorMsg(e instanceof Error ? e.message : JSON.stringify(e));
                setPhase("error");
            }
        })();
    }, [client, fetchKey]);
    const saveProvider = useCallback(async (provider, values) => {
        setPhase("saving");
        try {
            await client.goose.providersConfigSave_unstable({
                providerId: provider.providerId,
                fields: Object.entries(values).map(([key, value]) => ({
                    key,
                    value,
                })),
            });
            // Saving the fields only stores credentials. Without this the provider
            // never becomes the active default, so session creation fails right
            // after a "successful" setup.
            await client.goose.defaultsSave_unstable({
                providerId: provider.providerId,
                modelId: provider.defaultModel,
            });
            setPhase("success");
            setTimeout(onComplete, 1000);
        }
        catch (e) {
            setErrorMsg(e instanceof Error ? e.message : JSON.stringify(e));
            setPhase("error");
        }
    }, [client, onComplete]);
    const confirmProvider = useCallback((provider) => {
        const keys = provider.configKeys.filter((k) => k.required && !k.oauthFlow && !k.deviceCodeFlow);
        if (keys.length === 0) {
            saveProvider(provider, {});
            return;
        }
        setSelectedProvider(provider);
        setPhase("configure");
    }, [saveProvider]);
    const handleRetry = useCallback(() => {
        setErrorMsg("");
        setFetchKey((k) => k + 1);
        setPhase("loading");
    }, []);
    if (phase === "loading") {
        const contentHeight = 3; // spinner + text + spacing
        const topPad = Math.max(0, Math.floor((height - contentHeight) / 2));
        return (_jsxs(Box, { flexDirection: "column", alignItems: "center", width: width, height: height, overflow: "hidden", children: [topPad > 0 && _jsx(Box, { height: topPad }), _jsxs(Box, { flexDirection: "column", alignItems: "center", children: [_jsx(Spinner, { idx: spinIdx }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: TEXT_DIM, children: "loading providers\u2026" }) })] })] }));
    }
    if (phase === "error") {
        return (_jsx(Box, { flexDirection: "column", height: height, alignItems: "center", width: width, children: _jsx(ErrorScreen, { errorMsg: errorMsg, onRetry: handleRetry }) }));
    }
    if (phase === "saving") {
        const contentHeight = 3; // spinner + text + spacing
        const topPad = Math.max(0, Math.floor((height - contentHeight) / 2));
        return (_jsxs(Box, { flexDirection: "column", alignItems: "center", width: width, height: height, overflow: "hidden", children: [topPad > 0 && _jsx(Box, { height: topPad }), _jsxs(Box, { flexDirection: "column", alignItems: "center", children: [_jsx(Spinner, { idx: spinIdx }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: TEXT_DIM, children: "saving configuration\u2026" }) })] })] }));
    }
    if (phase === "success") {
        return _jsx(SuccessScreen, { provider: selectedProvider, height: height });
    }
    if (phase === "configure" && selectedProvider) {
        return (_jsx(ProviderConfigurator, { provider: selectedProvider, height: height, onComplete: (values) => saveProvider(selectedProvider, values), onBack: () => {
                setSelectedProvider(null);
                setPhase("select_provider");
            } }));
    }
    return (_jsx(ProviderSelector, { providers: providers, height: height, onSelect: confirmProvider }));
}
