// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_PAINTS_PER_WINDOW = 5;
const COOLDOWN_WINDOW_SECONDS = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader) {
    return null;
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = getBearerToken(request.headers.get("Authorization"));
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing bearer token in Authorization header" }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: "Supabase env vars are not configured" }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const dbClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired auth token" }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const sinceIso = new Date(Date.now() - COOLDOWN_WINDOW_SECONDS * 1000).toISOString();

    const [{ count: totalPaints, error: totalError }, { count: paintsInWindow, error: windowError }, latestPaintResult] =
      await Promise.all([
        dbClient.from("pixel_events").select("id", { head: true, count: "exact" }).eq("user_id", user.id),
        dbClient
          .from("pixel_events")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", user.id)
          .gt("created_at", sinceIso),
        dbClient
          .from("pixel_events")
          .select("created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (totalError || windowError || latestPaintResult.error) {
      return new Response(
        JSON.stringify({
          error: totalError?.message ?? windowError?.message ?? latestPaintResult.error?.message,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const used = paintsInWindow ?? 0;
    const remaining = Math.max(0, MAX_PAINTS_PER_WINDOW - used);

    return new Response(
      JSON.stringify({
        user_id: user.id,
        email: user.email ?? null,
        remaining_paints: remaining,
        paints_used_in_window: used,
        cooldown_window_seconds: COOLDOWN_WINDOW_SECONDS,
        total_paints: totalPaints ?? 0,
        last_painted_at: latestPaintResult.data?.created_at ?? null,
        generated_at: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
