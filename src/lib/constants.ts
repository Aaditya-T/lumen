export const BOARD_SIZE = 64;
export const MAX_PAINTS_PER_WINDOW = 5;
export const COOLDOWN_WINDOW_MS = 60_000;

export type PixelCell = {
  x: number;
  y: number;
  color: string;
  updated_at: string;
};

export type PlacePixelResult = {
  success: boolean;
  remaining_paints: number;
  next_available_at: string | null;
  error: string | null;
};
