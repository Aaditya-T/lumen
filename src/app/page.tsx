import { redirect } from "next/navigation";
import PixelBoard from "@/components/pixel-board";
import type { PixelCell } from "@/lib/constants";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("pixel_cells")
    .select("x, y, color, updated_at");

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
        <p className="rounded-md border border-red-400 bg-red-950 p-4 text-sm text-red-200">
          Failed to load board data: {error.message}
        </p>
      </main>
    );
  }

  const initialCells = (data ?? []) as PixelCell[];
  return <PixelBoard initialCells={initialCells} user={session.user} />;
}
