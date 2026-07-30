interface UseInputEditorOptions {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
    focus: boolean;
    isActive: boolean;
    spaceReserved: boolean;
    arrowsReserved: boolean;
    returnReserved: boolean;
}
interface UseInputEditorResult {
    cursorIndex: number;
}
export declare function useInputEditor({ value, onChange, onSubmit, focus, isActive, spaceReserved, arrowsReserved, returnReserved, }: UseInputEditorOptions): UseInputEditorResult;
export {};
