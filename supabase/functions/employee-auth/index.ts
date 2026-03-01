/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function employeeEmailFromId(employeeId: string) {
  return `${employeeId}@scs-smart-quiz.local`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const EVENT_PASSCODE = Deno.env.get("QUIZ_EVENT_PASSCODE");

  if (!SUPABASE_URL || !SERVICE_ROLE) return json(500, { ok: false, message: "Server not configured" });
  if (!EVENT_PASSCODE) return json(500, { ok: false, message: "Event passcode not configured" });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, message: "Invalid JSON" });
  }

  const employeeId = String(payload?.employeeId ?? "").trim();
  const fullName = String(payload?.fullName ?? "").trim();
  const passcode = String(payload?.passcode ?? "").trim();

  if (!employeeId || employeeId.length < 3 || employeeId.length > 32) {
    return json(400, { ok: false, message: "Invalid employeeId" });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(employeeId)) {
    return json(400, { ok: false, message: "Invalid employeeId format" });
  }
  if (!fullName || fullName.length < 2 || fullName.length > 80) {
    return json(400, { ok: false, message: "Invalid fullName" });
  }

  if (passcode !== EVENT_PASSCODE) {
    return json(401, { ok: false, message: "Incorrect passcode" });
  }

  const email = employeeEmailFromId(employeeId);
  const password = await sha256Hex(`${passcode}::${employeeId}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Create user if missing (idempotent-ish): if already exists, proceed.
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { employee_id: employeeId, full_name: fullName },
  });

  if (createErr) {
    const msg = (createErr as any)?.message ?? String(createErr);
    // If user already exists, that's OK.
    const okAlreadyExists = msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists");
    if (!okAlreadyExists) {
      console.error("createUser failed:", createErr);
      return json(400, { ok: false, message: msg });
    }
  }

  return json(200, { ok: true });
});
