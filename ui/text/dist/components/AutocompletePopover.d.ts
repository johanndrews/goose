import React from "react";
import type { AutocompleteEntry } from "../autocomplete.js";
export interface AutocompletePopoverProps {
    width: number;
    visibleRows: number;
    items: AutocompleteEntry[];
    highlightedIndex: number;
    loading: boolean;
    errored: boolean;
    emptyLabel: string;
}
export declare const AutocompletePopover: React.NamedExoticComponent<AutocompletePopoverProps>;
