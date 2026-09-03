export interface SubmitResult {
  ok: boolean;
  /** 0 means the request never completed. */
  status: number;
  body: unknown;
}

/** POST JSON from a client component to an admin `/api/staff-auth/*` route. */
export async function postJson(url: string, data: unknown): Promise<SubmitResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body: unknown = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}
