/// <reference types="https://deno.land/x/types@0.1.0/index.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

  // Ensure auth user exists and is confirmed.
  const { data: existing } = await admin.auth.admin.getUserByEmail(email);
  let userId = existing?.user?.id ?? null;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { employee_id: employeeId, full_name: fullName },
    });
    if (error) return json(400, { ok: false, message: error.message });
    userId = data.user?.id ?? null;
  }

  if (!userId) return json(500, { ok: false, message: "Unable to create user" });

  // Enforce unique employee_id -> user_id mapping via DB constraint; upsert profile.
  const { error: upsertErr } = await admin.from("profiles").upsert(
    { user_id: userId, employee_id: employeeId, full_name: fullName },
    { onConflict: "employee_id" },
  );
  if (upsertErr) return json(409, { ok: false, message: upsertErr.message });

  return json(200, { ok: true });
});
