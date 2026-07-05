"use client";

import * as React from "react";

// Per-card editing state, provided by CardShell. While NOT editing, a card's
// content is inert (pointer-events: none) so the whole card is a drag
// surface; double-click flips editing on and the controls come alive.
// `openRef` lets media-like cards (image, board) register their own
// double-click action (lightbox, navigate) instead of an edit mode.
export interface CardEditing {
  editing: boolean;
  setEditing: (v: boolean) => void;
  openRef: React.MutableRefObject<(() => void) | null>;
}

export const CardEditingContext = React.createContext<CardEditing | null>(
  null,
);

export const useCardEditing = () => React.useContext(CardEditingContext);
