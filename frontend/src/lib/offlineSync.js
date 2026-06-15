import { queuedSales, dequeueSale } from "./offlineDB.js";

// Replay queued offline sales to the server. Each carries a client_uuid, so the
// backend dedupes replays (no double charge). Returns a summary; stops early if
// the network is still down. Permanent (4xx) rejections are dropped from the
// queue and reported for manual handling — they'd never succeed on retry.
export async function syncQueue(api) {
  const queue = await queuedSales();
  const result = { synced: 0, failed: [], remaining: queue.length };
  for (const item of queue) {
    try {
      await api("/api/sales", { method: "POST", body: item.payload });
      await dequeueSale(item.uuid);
      result.synced++;
      result.remaining--;
    } catch (e) {
      if (e.status && e.status >= 400 && e.status < 500) {
        // The server reached us and refused (e.g. oversold, no open till).
        await dequeueSale(item.uuid);
        result.failed.push({ uuid: item.uuid, label: item.label, message: e.message });
        result.remaining--;
      } else {
        // Network still down — leave the rest queued and stop.
        break;
      }
    }
  }
  return result;
}
