export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function employeeEmailFromId(employeeId: string) {
  // Not a real inbox; used purely as a stable unique identifier for auth.
  return `${employeeId}@scs-smart-quiz.local`;
}
