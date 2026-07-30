import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
let renderer = null;
let rendererWidth = 0;
function getRenderer(width) {
    if (renderer && rendererWidth === width)
        return renderer;
    renderer = new Marked();
    renderer.use(markedTerminal({ width, reflowText: true, tab: 2 }));
    rendererWidth = width;
    return renderer;
}
export function renderMarkdown(src, width = 76) {
    if (!src)
        return [];
    const m = getRenderer(width);
    const rendered = m.parse(src).replace(/\n+$/, "");
    return rendered.split("\n");
}
