// Deterministic hashing utilities used for ledger anchoring + verification.
// IMPORTANT: Keep serialization stable across refreshes and environments.

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortRecursively(obj[k]);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
