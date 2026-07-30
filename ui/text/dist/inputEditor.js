import { useCallback, useEffect, useRef, useState } from "react";
import { useInput } from "ink";
// Mirrors ink-multiline-input's own normalization so the line boundaries used
// for up/down cursor movement match what the library used to compute.
function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
// Mirrors readline's word-motion convention (Alt+B / Alt+F in bash): moving
// back skips any whitespace immediately before the cursor, then skips the
// run of non-whitespace beyond it; moving forward mirrors that. Option+Left,
// Option+Right, and Option+Backspace all share this one scan so they agree
// on where a "word" starts and ends.
function findWordBoundary({ text, index, direction, }) {
    const isSpace = (i) => /\s/.test(text[i]);
    let i = index;
    if (direction === -1) {
        while (i > 0 && isSpace(i - 1))
            i--;
        while (i > 0 && !isSpace(i - 1))
            i--;
    }
    else {
        while (i < text.length && isSpace(i))
            i++;
        while (i < text.length && !isSpace(i))
            i++;
    }
    return i;
}
// Where the caret lands when moving a line up or down, keeping its column
// where the target line is long enough. Null when there is no such line.
function verticalTarget({ text, index, direction, }) {
    const lines = normalizeLineEndings(text).split("\n");
    let lineIndex = 0;
    let lineStart = 0;
    let col = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineEnd = lineStart + lines[i].length;
        if (index >= lineStart && index <= lineEnd) {
            lineIndex = i;
            col = index - lineStart;
            break;
        }
        lineStart = lineEnd + 1;
    }
    const targetIndex = lineIndex + direction;
    if (targetIndex < 0 || targetIndex >= lines.length)
        return null;
    let targetStart = 0;
    for (let i = 0; i < targetIndex; i++)
        targetStart += lines[i].length + 1;
    return targetStart + Math.min(col, lines[targetIndex].length);
}
function insertAt(text, index, insert) {
    return text.slice(0, index) + insert + text.slice(index);
}
function deleteRange(text, from, to) {
    return text.slice(0, from) + text.slice(to);
}
export function useInputEditor({ value, onChange, onSubmit, focus, isActive, spaceReserved, arrowsReserved, returnReserved, }) {
    const [cursorIndex, setCursorIndex] = useState(() => value.length);
    // Tracks the value this hook last produced itself. When `value` changes to
    // something else, the change came from outside (submit clearing the
    // buffer, history navigation, a slash command, etc.) and the cursor no
    // longer points at a meaningful position in the new text, so it moves to
    // the end instead of staying wherever it happened to be.
    const lastOwnValueRef = useRef(value);
    useEffect(() => {
        if (value === lastOwnValueRef.current)
            return;
        lastOwnValueRef.current = value;
        setCursorIndex(value.length);
    }, [value]);
    const applyChange = useCallback((newValue, newCursorIndex) => {
        lastOwnValueRef.current = newValue;
        onChange(newValue);
        setCursorIndex(newCursorIndex);
    }, [onChange]);
    const moveVertical = useCallback((direction) => {
        const target = verticalTarget({ text: value, index: cursorIndex, direction });
        if (target !== null)
            setCursorIndex(target);
    }, [value, cursorIndex]);
    useInput((input, key) => {
        // App's own history navigation owns shift+up/down; the editor must not
        // also move the cursor between lines on the same keypress.
        if (key.shift && (key.upArrow || key.downArrow))
            return;
        // One branch for Return so the two cases cannot be ordered wrongly:
        // any modifier means newline, a bare press submits. Shift only arrives
        // when the terminal speaks the Kitty protocol — plain terminals send the
        // same byte for Enter and Shift+Enter, and then Ctrl+Enter is the way.
        // A bare Return may belong to the autocomplete popover; a modified one
        // always inserts a newline and is never claimed elsewhere.
        if (key.return && returnReserved && !key.ctrl && !key.meta && !key.shift) {
            return;
        }
        if (key.return) {
            if (key.ctrl || key.meta || key.shift) {
                applyChange(insertAt(value, cursorIndex, "\n"), cursorIndex + 1);
                return;
            }
            onSubmit(value);
            return;
        }
        // Delete-word before the ctrl guard below: terminals send this either as
        // Option+Backspace or as Ctrl+W (readline's unix-word-rubout), and the
        // guard would swallow the latter.
        if ((key.meta && (key.backspace || key.delete)) ||
            (key.ctrl && input === "w")) {
            const boundary = findWordBoundary({
                text: value,
                index: cursorIndex,
                direction: -1,
            });
            if (boundary === cursorIndex)
                return;
            applyChange(deleteRange(value, boundary, cursorIndex), boundary);
            return;
        }
        // Ink reports ctrl+letter with `input` set to the letter itself, so any
        // ctrl combo would otherwise land in the buffer — pressing ^P to open the
        // provider overlay used to leave a stray "p" behind. The combos handled
        // above already returned, so this only swallows the rest.
        if (key.tab || key.ctrl)
            return;
        if (arrowsReserved && (key.upArrow || key.downArrow))
            return;
        if (key.upArrow) {
            moveVertical(-1);
            return;
        }
        if (key.downArrow) {
            moveVertical(1);
            return;
        }
        // Terminals disagree on Option+Arrow: some send the modified arrow
        // sequence, macOS defaults to the readline pair ESC-b / ESC-f, which Ink
        // reports as meta plus the bare letter. Accept both rather than betting
        // on one — the letters only count with the modifier, so typing b or f is
        // unaffected.
        if (key.meta && (key.leftArrow || input === "b")) {
            setCursorIndex((i) => findWordBoundary({ text: value, index: i, direction: -1 }));
            return;
        }
        if (key.meta && (key.rightArrow || input === "f")) {
            setCursorIndex((i) => findWordBoundary({ text: value, index: i, direction: 1 }));
            return;
        }
        if (key.leftArrow) {
            setCursorIndex((i) => Math.max(0, i - 1));
            return;
        }
        if (key.rightArrow) {
            setCursorIndex((i) => Math.min(value.length, i + 1));
            return;
        }
        if (key.backspace || key.delete) {
            if (cursorIndex === 0)
                return;
            applyChange(deleteRange(value, cursorIndex - 1, cursorIndex), cursorIndex - 1);
            return;
        }
        if (input === " " && spaceReserved)
            return;
        if (input) {
            applyChange(insertAt(value, cursorIndex, input), cursorIndex + input.length);
        }
    }, { isActive: focus && isActive });
    return { cursorIndex };
}
