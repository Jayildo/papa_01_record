import type { WorkLog, WorkLogLaborer, WorkLogItem } from '../types';

// Indices in the CSV columns (0-based)
const COL_ID = 0;
const COL_WORK_DATE = 2;
const COL_WEATHER = 3;
const COL_TEMPERATURE = 4;
const COL_LOCATION = 5;
const COL_WORK_DESC = 6;
const COL_TOTAL_AMOUNT = 7;
const COL_LABORER_NAME = 13;
const COL_LABORER_RESIDENT_ID = 14;
const COL_LABORER_COMPANY = 15;
const COL_LABORER_DAILY_WAGE = 16;
const COL_LABORER_NOTE = 17;
const COL_ITEM_CATEGORY = 18;
const COL_ITEM_DETAIL = 19;
const COL_ITEM_UNIT = 20;
const COL_ITEM_QTY = 21;
const COL_ITEM_AMOUNT = 22;
const COL_ITEM_NOTE = 23;

function parseFields(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // quoted field
      let val = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          val += line[i];
          i++;
        }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }
  return fields;
}

function nullify(val: string): string | undefined {
  const trimmed = val.trim();
  if (trimmed === '' || trimmed === 'null') return undefined;
  return trimmed;
}

function nullifyNum(val: string): number | undefined {
  const s = nullify(val);
  if (s === undefined) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}

// Strip triple-quoted ID like """4158968""" → "4158968"
function stripId(raw: string): string {
  return raw.replace(/^"+|"+$/g, '');
}

export function parseWorklogCsv(text: string): WorkLog[] {
  const lines = text.split(/\r?\n/);
  // skip header row
  const dataLines = lines.slice(1).filter((l) => l.trim() !== '');

  // group by ID
  const groups = new Map<string, string[][]>();
  for (const line of dataLines) {
    const fields = parseFields(line);
    const rawId = fields[COL_ID] ?? '';
    const id = stripId(rawId);
    if (!id) continue;
    const existing = groups.get(id) ?? [];
    existing.push(fields);
    groups.set(id, existing);
  }

  const logs: WorkLog[] = [];

  for (const [extId, rows] of groups) {
    const header = rows[0];

    const workDate = nullify(header[COL_WORK_DATE] ?? '') ?? '';
    const weather = nullify(header[COL_WEATHER] ?? '');
    const temperature = nullify(header[COL_TEMPERATURE] ?? '');
    const location = nullify(header[COL_LOCATION] ?? '');
    const workDesc = nullify(header[COL_WORK_DESC] ?? '');
    const totalAmountRaw = nullify(header[COL_TOTAL_AMOUNT] ?? '');
    const totalAmount = totalAmountRaw !== undefined ? Number(totalAmountRaw) || undefined : undefined;

    const laborers: WorkLogLaborer[] = [];
    const items: WorkLogItem[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const laborerName = nullify(row[COL_LABORER_NAME] ?? '');
      if (laborerName !== undefined) {
        laborers.push({
          id: crypto.randomUUID(),
          name: laborerName,
          residentId: nullify(row[COL_LABORER_RESIDENT_ID] ?? ''),
          company: nullify(row[COL_LABORER_COMPANY] ?? ''),
          dailyWage: nullifyNum(row[COL_LABORER_DAILY_WAGE] ?? ''),
          note: nullify(row[COL_LABORER_NOTE] ?? ''),
          sortOrder: laborers.length,
        });
      }

      const itemCategory = nullify(row[COL_ITEM_CATEGORY] ?? '');
      const itemDetail = nullify(row[COL_ITEM_DETAIL] ?? '');
      if (itemCategory !== undefined || itemDetail !== undefined) {
        items.push({
          id: crypto.randomUUID(),
          category: itemCategory,
          detail: itemDetail,
          unit: nullify(row[COL_ITEM_UNIT] ?? ''),
          qty: nullifyNum(row[COL_ITEM_QTY] ?? ''),
          amount: nullifyNum(row[COL_ITEM_AMOUNT] ?? ''),
          note: nullify(row[COL_ITEM_NOTE] ?? ''),
          sortOrder: items.length,
        });
      }
    }

    logs.push({
      id: crypto.randomUUID(),
      externalId: extId,
      workDate,
      weather,
      temperature,
      location,
      workDesc,
      totalAmount,
      laborers,
      items,
    });
  }

  return logs;
}
