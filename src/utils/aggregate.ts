import type { TreeRecord, DiameterRange } from '../types';
import { DIAMETER_RANGES, SPECIES_LIST } from '../types';

function getDiameterRange(diameter: number): DiameterRange {
  if (diameter <= 10) return '~10';
  if (diameter <= 20) return '11~20';
  if (diameter <= 30) return '21~30';
  if (diameter <= 40) return '31~40';
  if (diameter <= 50) return '41~50';
  if (diameter <= 60) return '51~60';
  if (diameter <= 70) return '61~70';
  return '71~';
}

export interface PivotRow {
  location: string;
  counts: Record<string, Record<DiameterRange, number>>;
  speciesSubtotals: Record<string, number>;
  total: number;
}

export interface PivotResult {
  rows: PivotRow[];
  columnTotals: Record<string, Record<DiameterRange, number>>;
  speciesTotals: Record<string, number>;
  grandTotal: number;
}

export function aggregate(records: TreeRecord[]): PivotResult {
  const validRecords = records.filter(
    (r) => r.species !== '' && r.diameter > 0 && r.location !== '',
  );

  const locationOrder: string[] = [];
  const locationSet = new Set<string>();

  for (const r of validRecords) {
    if (!locationSet.has(r.location)) {
      locationSet.add(r.location);
      locationOrder.push(r.location);
    }
  }

  const makeSpeciesCounts = () => {
    const m: Record<string, Record<DiameterRange, number>> = {};
    for (const sp of SPECIES_LIST) {
      m[sp] = {} as Record<DiameterRange, number>;
      for (const dr of DIAMETER_RANGES) m[sp][dr] = 0;
    }
    return m;
  };

  const rows: PivotRow[] = locationOrder.map((loc) => {
    const counts = makeSpeciesCounts();
    const locRecords = validRecords.filter((r) => r.location === loc);

    for (const r of locRecords) {
      const range = getDiameterRange(r.diameter);
      counts[r.species][range]++;
    }

    const speciesSubtotals: Record<string, number> = {};
    let total = 0;
    for (const sp of SPECIES_LIST) {
      const sub = DIAMETER_RANGES.reduce((sum, dr) => sum + counts[sp][dr], 0);
      speciesSubtotals[sp] = sub;
      total += sub;
    }

    return { location: loc, counts, speciesSubtotals, total };
  });

  const columnTotals = makeSpeciesCounts();
  const speciesTotals: Record<string, number> = {};
  let grandTotal = 0;

  for (const sp of SPECIES_LIST) {
    speciesTotals[sp] = 0;
  }

  for (const row of rows) {
    for (const sp of SPECIES_LIST) {
      for (const dr of DIAMETER_RANGES) {
        columnTotals[sp][dr] += row.counts[sp][dr];
      }
      speciesTotals[sp] += row.speciesSubtotals[sp];
    }
    grandTotal += row.total;
  }

  return { rows, columnTotals, speciesTotals, grandTotal };
}
