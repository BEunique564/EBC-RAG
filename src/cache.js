import { createHash } from "node:crypto";

const DEFAULT_TTL = 300;

export function createCache(redisUrl = "redis://redis:6379") {
  let client = null;
  let connected = false;

  async function ensure() {
    if (connected && client) return;
    const { Redis } = await import("ioredis");
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true
    });
    client.on("error", () => { connected = false; });
    client.on("connect", () => { connected = true; });
    await client.connect();
    connected = true;
  }

  function cacheKey(query, filters) {
    const payload = JSON.stringify({ q: query.toLowerCase().trim(), f: filters || {} });
    return `rag:${createHash("sha256").update(payload).digest("hex")}`;
  }

  return {
    async get(query, filters) {
      try {
        await ensure();
        const raw = await client.get(cacheKey(query, filters));
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    async set(query, filters, data, ttl = DEFAULT_TTL) {
      try {
        await ensure();
        await client.set(cacheKey(query, filters), JSON.stringify(data), "EX", ttl);
      } catch {
        /* cache failure is non-fatal */
      }
    },

    async close() {
      if (client) {
        connected = false;
        await client.quit();
        client = null;
      }
    },

    get connected() { return connected; }
  };
}
