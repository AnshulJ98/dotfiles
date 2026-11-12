export interface UserProfile {
  id: string;
  name: string;
}

export class ProfileFetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProfileFetchError";
  }
}

const BASE_URL = process.env.USER_API_URL ?? "https://api.internal";
const TTL_MS = 60_000;
const MAX_ENTRIES = 1_000;
const TIMEOUT_MS = 5_000;

interface Entry {
  profile: UserProfile;
  expires: number;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<UserProfile | undefined>>();

function isUserProfile(value: unknown): value is UserProfile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; name?: unknown };
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

/** The profile of a user in a region; undefined when the user does not exist. */
export async function getUserProfile(userId: string, region: string): Promise<UserProfile | undefined> {
  const key = `${region}\u0000${userId}`;
  const hit = cache.get(key);
  if (hit !== undefined && hit.expires > Date.now()) return hit.profile;
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;
  const request = load(userId, region, key).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

async function load(userId: string, region: string, key: string): Promise<UserProfile | undefined> {
  const url = `${BASE_URL}/${encodeURIComponent(region)}/users/${encodeURIComponent(userId)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new ProfileFetchError(`profile request failed with ${res.status}`, res.status);
  const body: unknown = await res.json();
  if (!isUserProfile(body)) throw new ProfileFetchError("profile response has an unexpected shape");
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { profile: body, expires: Date.now() + TTL_MS });
  return body;
}
