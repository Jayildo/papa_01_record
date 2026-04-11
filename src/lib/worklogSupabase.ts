import { supabase } from './supabase';
import type { WorkLog, WorkLogLaborer, WorkLogItem } from '../types';

type WorkLogRow = {
  id: string;
  external_id: string | null;
  work_date: string;
  weather: string | null;
  temperature: string | null;
  location: string | null;
  work_desc: string | null;
  total_amount: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type WorkLogLaborerRow = {
  id: string;
  log_id: string;
  name: string;
  resident_id: string | null;
  company: string | null;
  daily_wage: number | null;
  note: string | null;
  sort_order: number;
};

type WorkLogItemRow = {
  id: string;
  log_id: string;
  category: string | null;
  detail: string | null;
  unit: string | null;
  qty: number | null;
  amount: number | null;
  note: string | null;
  sort_order: number;
};

function mapLog(
  row: WorkLogRow,
  laborers: WorkLogLaborer[],
  items: WorkLogItem[],
): WorkLog {
  return {
    id: row.id,
    externalId: row.external_id ?? undefined,
    workDate: row.work_date ?? '',
    weather: row.weather ?? undefined,
    temperature: row.temperature ?? undefined,
    location: row.location ?? undefined,
    workDesc: row.work_desc ?? undefined,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : undefined,
    note: row.note ?? undefined,
    laborers,
    items,
  };
}

function mapLaborer(row: WorkLogLaborerRow): WorkLogLaborer {
  return {
    id: row.id,
    name: row.name ?? '',
    residentId: row.resident_id ?? undefined,
    company: row.company ?? undefined,
    dailyWage: row.daily_wage != null ? Number(row.daily_wage) : undefined,
    note: row.note ?? undefined,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapItem(row: WorkLogItemRow): WorkLogItem {
  return {
    id: row.id,
    category: row.category ?? undefined,
    detail: row.detail ?? undefined,
    unit: row.unit ?? undefined,
    qty: row.qty != null ? Number(row.qty) : undefined,
    amount: row.amount != null ? Number(row.amount) : undefined,
    note: row.note ?? undefined,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export async function fetchWorkLogs(from?: string, to?: string): Promise<WorkLog[]> {
  let query = supabase
    .from('work_logs')
    .select('*')
    .is('deleted_at', null)
    .order('work_date', { ascending: false });

  if (from) query = query.gte('work_date', from);
  if (to) query = query.lte('work_date', to);

  const { data: logRows, error: logError } = await query;
  if (logError) throw logError;
  if (!logRows || logRows.length === 0) return [];

  const logIds = logRows.map((r) => r.id as string);

  const { data: laborerRows, error: laborerError } = await supabase
    .from('work_log_laborers')
    .select('*')
    .in('log_id', logIds)
    .order('sort_order', { ascending: true });
  if (laborerError) throw laborerError;

  const { data: itemRows, error: itemError } = await supabase
    .from('work_log_items')
    .select('*')
    .in('log_id', logIds)
    .order('sort_order', { ascending: true });
  if (itemError) throw itemError;

  const laborersByLog = new Map<string, WorkLogLaborer[]>();
  for (const row of (laborerRows ?? []) as WorkLogLaborerRow[]) {
    const list = laborersByLog.get(row.log_id) ?? [];
    list.push(mapLaborer(row));
    laborersByLog.set(row.log_id, list);
  }

  const itemsByLog = new Map<string, WorkLogItem[]>();
  for (const row of (itemRows ?? []) as WorkLogItemRow[]) {
    const list = itemsByLog.get(row.log_id) ?? [];
    list.push(mapItem(row));
    itemsByLog.set(row.log_id, list);
  }

  return (logRows as WorkLogRow[]).map((row) =>
    mapLog(row, laborersByLog.get(row.id) ?? [], itemsByLog.get(row.id) ?? []),
  );
}

export async function upsertWorkLog(log: WorkLog): Promise<void> {
  const logId = log.id || crypto.randomUUID();

  const { error: logError } = await supabase
    .from('work_logs')
    .upsert(
      {
        id: logId,
        external_id: log.externalId ?? null,
        work_date: log.workDate,
        weather: log.weather ?? null,
        temperature: log.temperature ?? null,
        location: log.location ?? null,
        work_desc: log.workDesc ?? null,
        total_amount: log.totalAmount ?? null,
        note: log.note ?? null,
      },
      { onConflict: 'id' },
    );
  if (logError) throw logError;

  const { error: delLaborers } = await supabase
    .from('work_log_laborers')
    .delete()
    .eq('log_id', logId);
  if (delLaborers) throw delLaborers;

  const { error: delItems } = await supabase
    .from('work_log_items')
    .delete()
    .eq('log_id', logId);
  if (delItems) throw delItems;

  if (log.laborers.length > 0) {
    const { error } = await supabase.from('work_log_laborers').insert(
      log.laborers.map((l, i) => ({
        id: l.id || crypto.randomUUID(),
        log_id: logId,
        name: l.name,
        resident_id: l.residentId ?? null,
        company: l.company ?? null,
        daily_wage: l.dailyWage ?? null,
        note: l.note ?? null,
        sort_order: i,
      })),
    );
    if (error) throw error;
  }

  if (log.items.length > 0) {
    const { error } = await supabase.from('work_log_items').insert(
      log.items.map((item, i) => ({
        id: item.id || crypto.randomUUID(),
        log_id: logId,
        category: item.category ?? null,
        detail: item.detail ?? null,
        unit: item.unit ?? null,
        qty: item.qty ?? null,
        amount: item.amount ?? null,
        note: item.note ?? null,
        sort_order: i,
      })),
    );
    if (error) throw error;
  }
}

export async function deleteWorkLog(id: string): Promise<void> {
  const { error } = await supabase
    .from('work_logs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function bulkImportWorkLogs(
  logs: WorkLog[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const log of logs) {
    if (log.externalId) {
      const { data: existing } = await supabase
        .from('work_logs')
        .select('id')
        .eq('external_id', log.externalId)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }
    }

    await upsertWorkLog({ ...log, id: crypto.randomUUID() });
    inserted++;
  }

  return { inserted, skipped };
}
