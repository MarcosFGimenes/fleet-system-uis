export type TelemetrySnapshot = {
  hours?: number;
  odometerKm?: number;
  fuelUsedL?: number;
  idleTimeH?: number;
  faultCodes?: string[];
  windowStart?: string;
  windowEnd?: string;
};

function pseudoRandom(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) & 0xffffffff;
  }
  return Math.abs(hash);
}

export async function fetchTelemetrySnapshot(assetId: string, atIso: string): Promise<TelemetrySnapshot> {
  const baseSeed = `${assetId}-${atIso}`;
  const random = pseudoRandom(baseSeed);
  const windowStart = new Date(new Date(atIso).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(atIso).getTime() + 6 * 60 * 60 * 1000).toISOString();

  return {
    hours: Number(((random % 8000) / 10).toFixed(1)),
    odometerKm: Number(((random % 500000) / 10).toFixed(1)),
    fuelUsedL: Number(((random % 9000) / 100).toFixed(1)),
    idleTimeH: Number((((random / 3) % 2000) / 10).toFixed(1)),
    faultCodes: random % 5 === 0 ? ["E123", "P2047"] : random % 7 === 0 ? ["C880"] : [],
    windowStart,
    windowEnd,
  };
}
