"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload, User } from "@supabase/supabase-js";
import {
  BOARD_SIZE,
  COOLDOWN_WINDOW_MS,
  MAX_PAINTS_PER_WINDOW,
  type PixelCell,
  type PlacePixelResult,
} from "@/lib/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PixelBoardProps = {
  initialCells: PixelCell[];
  user: User;
};

type PixelEventRow = {
  created_at: string;
};

const cellKey = (x: number, y: number) => `${x}:${y}`;

const PRESET_COLORS = [
  "#f8fafc",
  "#d4d4d8",
  "#a1a1aa",
  "#18181b",
  "#f9a8d4",
  "#ef4444",
  "#f59e0b",
  "#d97706",
  "#fde047",
  "#a3e635",
  "#22c55e",
  "#06b6d4",
  "#0ea5e9",
  "#2563eb",
  "#c084fc",
  "#a21caf",
];

const formatCooldown = (nextAvailableAt: string | null): string => {
  if (!nextAvailableAt) {
    return "Ready to paint.";
  }

  const target = new Date(nextAvailableAt).getTime();
  const now = Date.now();
  if (target <= now) {
    return "Ready to paint.";
  }

  const remainingMs = target - now;
  const seconds = Math.ceil(remainingMs / 1000);
  return `Next paint slot in ${seconds}s`;
};

export default function PixelBoard({ initialCells, user }: PixelBoardProps) {
  const supabase = getSupabaseBrowserClient();
  const [selectedColor, setSelectedColor] = useState("#ef4444");
  const [status, setStatus] = useState<string>("");
  const [clockMs, setClockMs] = useState<number>(() => Date.now());
  const [recentPaintMs, setRecentPaintMs] = useState<number[]>([]);
  const [peerConnections, setPeerConnections] = useState<number>(1);
  const [onlineUsers, setOnlineUsers] = useState<number>(1);
  const [isPainting, setIsPainting] = useState(false);
  const [cellsMap, setCellsMap] = useState<Map<string, PixelCell>>(() => {
    const map = new Map<string, PixelCell>();
    for (const cell of initialCells) {
      map.set(cellKey(cell.x, cell.y), cell);
    }
    return map;
  });

  const tabIdRef = useRef<string>(user.id);

  const refreshRateWindow = useCallback(async () => {
    const sinceIso = new Date(Date.now() - COOLDOWN_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("pixel_events")
      .select("created_at")
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(MAX_PAINTS_PER_WINDOW);

    const timestamps = ((data ?? []) as PixelEventRow[])
      .map((row) => new Date(row.created_at).getTime())
      .filter((ts) => Number.isFinite(ts));
    setRecentPaintMs(timestamps);
  }, [supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshRateWindow();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshRateWindow]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tabIdRef.current !== user.id) {
      return;
    }
    const generatedId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    tabIdRef.current = `${user.id}-${generatedId}`;
  }, [user.id]);

  useEffect(() => {
    const presenceChannel = supabase.channel("pixel-presence", {
      config: {
        presence: {
          key: tabIdRef.current,
        },
      },
    });

    const updatePresenceCounts = () => {
      const state = presenceChannel.presenceState() as Record<string, Array<{ user_id?: string }>>;
      let connections = 0;
      const users = new Set<string>();

      for (const metas of Object.values(state)) {
        connections += metas.length;
        for (const meta of metas) {
          if (meta.user_id) {
            users.add(meta.user_id);
          }
        }
      }

      setPeerConnections(Math.max(1, connections));
      setOnlineUsers(Math.max(1, users.size));
    };

    presenceChannel
      .on("presence", { event: "sync" }, updatePresenceCounts)
      .subscribe(async (channelStatus) => {
        if (channelStatus !== "SUBSCRIBED") {
          return;
        }
        await presenceChannel.track({
          user_id: user.id,
          online_at: new Date().toISOString(),
        });
        updatePresenceCounts();
      });

    return () => {
      void presenceChannel.untrack();
      void supabase.removeChannel(presenceChannel);
    };
  }, [supabase, user.id]);

  useEffect(() => {
    const channel = supabase
      .channel("pixel-cells")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pixel_cells" },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const row = (payload.new ?? payload.old) as Partial<PixelCell> | null;
          if (!row || typeof row.x !== "number" || typeof row.y !== "number") {
            return;
          }

          if (payload.eventType === "DELETE") {
            setCellsMap((prev) => {
              const copy = new Map(prev);
              copy.delete(cellKey(row.x as number, row.y as number));
              return copy;
            });
            return;
          }

          if (typeof row.color !== "string" || typeof row.updated_at !== "string") {
            return;
          }

          const nextCell: PixelCell = {
            x: row.x,
            y: row.y,
            color: row.color,
            updated_at: row.updated_at,
          };

          setCellsMap((prev) => {
            const copy = new Map(prev);
            copy.set(cellKey(nextCell.x, nextCell.y), nextCell);
            return copy;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const activeWindowPaints = useMemo(
    () => recentPaintMs.filter((timestamp) => clockMs - timestamp < COOLDOWN_WINDOW_MS),
    [recentPaintMs, clockMs],
  );
  const paintsUsed = activeWindowPaints.length;
  const remainingPaints = Math.max(0, MAX_PAINTS_PER_WINDOW - paintsUsed);
  const nextAvailableAt =
    paintsUsed >= MAX_PAINTS_PER_WINDOW
      ? new Date(Math.min(...activeWindowPaints) + COOLDOWN_WINDOW_MS).toISOString()
      : null;
  const cooldownSeconds = nextAvailableAt
    ? Math.max(0, Math.ceil((new Date(nextAvailableAt).getTime() - clockMs) / 1000))
    : 0;
  const isRateLimited = remainingPaints <= 0 && cooldownSeconds > 0;

  const gridCells = useMemo(() => {
    const cells: { x: number; y: number; color: string }[] = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const existing = cellsMap.get(cellKey(x, y));
        cells.push({ x, y, color: existing?.color ?? "#111827" });
      }
    }
    return cells;
  }, [cellsMap]);

  const handlePaint = async (x: number, y: number) => {
    if (isPainting) {
      return;
    }

    if (isRateLimited) {
      setStatus(`Rate limited. Try again in ${cooldownSeconds}s.`);
      return;
    }

    setIsPainting(true);
    const { data, error } = await supabase.rpc("place_pixel", {
      p_x: x,
      p_y: y,
      p_color: selectedColor,
    });
    setIsPainting(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    const result = (data?.[0] ?? null) as PlacePixelResult | null;
    if (!result) {
      setStatus("Unexpected response from server.");
      return;
    }

    if (!result.success) {
      setStatus(result.error ?? "Paint blocked by cooldown");
      void refreshRateWindow();
      return;
    }

    setRecentPaintMs((prev) => [Date.now(), ...prev].slice(0, MAX_PAINTS_PER_WINDOW * 3));
    setStatus("Pixel painted.");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const windowSeconds = Math.floor(COOLDOWN_WINDOW_MS / 1000);
  const cooldownMessage = formatCooldown(nextAvailableAt);
  const statusMessage = status || cooldownMessage;
  const usagePercent = Math.round((paintsUsed / MAX_PAINTS_PER_WINDOW) * 100);

  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-[#04070c] text-zinc-100">
      <header className="flex h-12 items-center justify-between border-b border-white/10 bg-[#02040a] px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-[0.2em] text-emerald-400">SYNCEL</h1>
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Peers: {peerConnections}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="hidden max-w-[30ch] truncate sm:inline">{user.email ?? user.id}</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded border border-white/20 px-2 py-1 uppercase tracking-wide text-zinc-300 hover:border-white/40 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        <div className="aspect-square w-full max-w-[760px] rounded-sm border border-white/10 bg-[#010205] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_20px_60px_rgba(0,0,0,0.55)]">
          <div className="flex h-full w-full items-center justify-center rounded-sm border border-white/5 bg-[#060a12]">
            <div
              className="grid gap-0"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
              }}
            >
              {gridCells.map((cell) => (
                <button
                  key={cellKey(cell.x, cell.y)}
                  type="button"
                  aria-label={`Paint pixel ${cell.x},${cell.y}`}
                  onClick={() => void handlePaint(cell.x, cell.y)}
                  disabled={isPainting || isRateLimited}
                  className="h-[10px] w-[10px] border border-black/20 transition-transform hover:z-10 hover:scale-125 disabled:cursor-not-allowed disabled:opacity-90"
                  style={{ backgroundColor: cell.color }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="space-y-2 border-t border-white/10 bg-[#02040a] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <input
              type="color"
              value={selectedColor}
              onChange={(event) => setSelectedColor(event.target.value)}
              aria-label="Choose custom color"
              className="h-7 w-7 shrink-0 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
            />
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Pick ${color}`}
              onClick={() => setSelectedColor(color)}
              className={`h-7 w-7 shrink-0 rounded-sm border ${
                selectedColor.toLowerCase() === color.toLowerCase()
                  ? "border-emerald-400 shadow-[0_0_0_1px_rgba(74,222,128,0.4)]"
                  : "border-white/10"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
          <div className="text-right text-[11px] uppercase tracking-[0.1em] text-zinc-400">
            <p>
              Pixels: {remainingPaints}/{MAX_PAINTS_PER_WINDOW}
            </p>
            <p className="text-zinc-500">Users online: {onlineUsers}</p>
          </div>
        </div>

        <div className="h-1.5 w-full rounded bg-white/10">
          <div
            className={`h-full rounded ${isRateLimited ? "bg-red-400" : "bg-emerald-400"}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <p
          className={`text-[11px] uppercase tracking-[0.08em] ${
            isRateLimited ? "text-red-300" : "text-zinc-400"
          }`}
        >
          {statusMessage} ({MAX_PAINTS_PER_WINDOW} paints / {windowSeconds}s)
        </p>
      </footer>
    </main>
  );
}
