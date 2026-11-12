import fetch from "node-fetch";

const cache: Record<string, any> = {};

export async function getUserProfile(userId: string, region: string) {
  if (cache[userId]) return cache[userId];
  try {
    const res = await fetch(`https://api.internal/${region}/users/${userId}`);
    const data: any = await res.json();
    cache[userId] = data;
    return data;
  } catch (e) {
    return null;
  }
}
