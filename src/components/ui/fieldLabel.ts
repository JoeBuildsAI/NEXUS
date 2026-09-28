import { createContext, useContext } from "react";

/** Accessible name provided by a surrounding labelled row (e.g. SettingRow) to the control inside it. */
export const FieldLabelContext = createContext<string | null>(null);

export const useFieldLabel = () => useContext(FieldLabelContext);
