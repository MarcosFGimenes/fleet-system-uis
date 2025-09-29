import type { TelemetryRef } from "@/types/nonconformity";

function pseudoRandom(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) & 0xffffffff;
  }
  return Math.abs(hash);
}

export async function fetchTelemetrySnapshot(assetId: string, atIso: string): Promise<TelemetryRef> {
  const random = pseudoRandom(`${assetId}-${atIso}`);
  const baseDate = new Date(atIso);
  const windowStart = new Date(baseDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(baseDate.getTime() + 6 * 60 * 60 * 1000).toISOString();

  return {
    hours: Number(((random % 8000) / 10).toFixed(1)),
    odometerKm: Number(((random % 600000) / 10).toFixed(1)),
    fuelUsedL: Number(((random % 9000) / 100).toFixed(1)),
    idleTimeH: Number((((random / 5) % 2000) / 10).toFixed(1)),
    faultCodes: random % 4 === 0 ? ["E123", "P2047"] : random % 6 === 0 ? ["C880"] : [],
    windowStart,
    windowEnd,
  };
}
