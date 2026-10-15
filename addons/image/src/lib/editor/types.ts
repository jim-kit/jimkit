export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Adjust {
  exposure: number; // -100..100, about one stop at the ends
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  warmth: number; // -100..100, negative is cooler
  sharpen: number; // 0..100
  vignette: number; // 0..100
}

export const NEUTRAL: Adjust = { exposure: 0, brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpen: 0, vignette: 0 };

export type FilterId = "none" | "mono" | "noir" | "sepia" | "vivid" | "fade" | "warm" | "cool" | "dramatic" | "vintage";

export interface Stroke {
  id: string;
  kind: "pen" | "marker";
  color: string;
  /** brush width in base pixels */
  size: number;
  points: [number, number][];
}

export type FontId = "sans" | "serif" | "mono" | "display" | "hand";
export type TextAlign = "left" | "center" | "right";

export interface TextItem {
  id: string;
  text: string;
  /** centre of the text box in base pixels. The box turns about this point. */
  x: number;
  y: number;
  /** font size in base pixels */
  size: number;
  /** degrees clockwise, -180..180 */
  rotation: number;
  color: string;
  font: FontId;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  /** 0..1, applies to the text and its box together */
  opacity: number;
  /** outline width as a share of the font size; 0 is none */
  outline: number;
  outlineColor: string;
  /** draw a soft dark backing so text reads on any photo */
  shadow: boolean;
  /** colour of a box behind the text, or null for none */
  bg: string | null;
}

export interface EditState {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  /** degrees, -45..45 */
  straighten: number;
  /** in base space (after rotate/flip/straighten). null keeps everything */
  crop: Rect | null;
  adjust: Adjust;
  filter: FilterId;
  /** 0..100 */
  filterAmount: number;
  strokes: Stroke[];
  texts: TextItem[];
  /**
   * Squish and stretch: the picture is scaled by these factors, across and down the screen, after it is turned and
   * straightened. Everything else (crop, drawings, text) lives in the scaled picture's coordinates.
   */
  stretch: { x: number; y: number };
}

export const INITIAL: EditState = {
  rotation: 0, flipH: false, flipV: false, straighten: 0, crop: null,
  adjust: NEUTRAL, filter: "none", filterAmount: 100, strokes: [], texts: [], stretch: { x: 1, y: 1 },
};

export const ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "original", label: "Original", ratio: -1 }, // resolved against the image
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];
