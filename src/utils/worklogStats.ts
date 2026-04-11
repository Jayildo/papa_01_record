import type { WorkLog } from '../types';

export interface MonthlyStats {
  total: number;
  count: number;
  laborSum: number;
  itemSum: number;
  topLocations: { location: string; amount: number }[];
  daily: WorkLog[];
}

export function listMonths(logs: WorkLog[]): string[] {
  const months = new Set<string>();
  for (const log of logs) {
    if (log.workDate && log.workDate.length >= 7) {
      months.add(log.workDate.slice(0, 7));
    }
  }
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

export function computeMonthlyStats(logs: WorkLog[], yyyymm: string): MonthlyStats {
  const daily = logs.filter(
    (l) => l.workDate && l.workDate.startsWith(yyyymm),
  );

  let total = 0;
  let laborSum = 0;
  let itemSum = 0;

  const locationAmounts = new Map<string, number>();

  for (const log of daily) {
    const logLaborSum = log.laborers.reduce((s, l) => s + (l.dailyWage ?? 0), 0);
    const logItemSum = log.items.reduce((s, it) => s + (it.amount ?? 0), 0);
    laborSum += logLaborSum;
    itemSum += logItemSum;

    // prefer stored totalAmount; fall back to computed sum
    const logTotal = log.totalAmount ?? logLaborSum + logItemSum;
    total += logTotal;

    const loc = log.location ?? '(미입력)';
    locationAmounts.set(loc, (locationAmounts.get(loc) ?? 0) + logTotal);
  }

  const topLocations = Array.from(locationAmounts.entries())
    .map(([location, amount]) => ({ location, amount }))
    .sort((a, b) => b.amount - a.amount);

  return { total, count: daily.length, laborSum, itemSum, topLocations, daily };
}
