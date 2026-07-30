interface Props {
    content: string;
    truncated: boolean;
    width: number;
    height: number;
    onClose: () => void;
}
export declare function DiffViewer({ content, truncated, width, height, onClose, }: Props): import("react/jsx-runtime").JSX.Element;
export {};
