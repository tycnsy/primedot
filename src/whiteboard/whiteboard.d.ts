// Public types for the whiteboard module. The implementation is plain JS
// (compiled via allowJs); this file gives TS consumers a typed boundary.
//
// Element shape mirrors the contract documented in
// whiteboard_handoff/whiteboard/README.md.

export type WhiteboardElementType =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'freedraw'
  | 'text';

export type WhiteboardFillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type WhiteboardEdge = 'sharp' | 'round';
export type WhiteboardTextAlign = 'left' | 'center' | 'right';
export interface WhiteboardTextRun {
  text: string;
  color: string;
}

export interface WhiteboardElement {
  id: string;
  type: WhiteboardElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  fill?: string;
  fillStyle?: WhiteboardFillStyle;
  strokeWidth?: number;
  /** 0 (architect) — 2 (cartoonist) */
  roughness?: number;
  edge?: WhiteboardEdge;
  /** Stable rough.js seed — keep this constant per element */
  seed: number;
  // freedraw only:
  points?: [number, number][];
  /** Per-point input pressure (parallel to points) for perfect-freehand. */
  pressures?: number[];
  /** When true, pressure is simulated from point spacing (no real stylus data). */
  simulatePressure?: boolean;
  /** Last point once the stroke is finished; closes the perfect-freehand end cap. */
  lastCommittedPoint?: [number, number];
  // text only:
  text?: string;
  textRuns?: WhiteboardTextRun[];
  fontSize?: number;
  textAlign?: WhiteboardTextAlign;
  /** if set, text wraps at this width */
  manualWidth?: number;
}

export interface WhiteboardProps {
  /** Slug used to namespace localStorage and resolve the Supabase row. */
  boardId: string;
}

declare module './whiteboard-app' {
  export const Whiteboard: (props: WhiteboardProps) => JSX.Element;
}
