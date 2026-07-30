import { type ToolCallInfo } from "../toolcall.js";
interface Props {
    info: ToolCallInfo;
    width: number;
    height: number;
    scrollOffset: number;
    onScroll: (updater: (prev: number) => number) => void;
    onClose: () => void;
}
export declare function ToolCallExpanded({ info, width, height, scrollOffset, onScroll, onClose, }: Props): import("react/jsx-runtime").JSX.Element;
export {};
