import type { TreeRecord } from '../types';
import { DIAMETER_RANGES, SPECIES_LIST, DIAMETER_LABELS } from '../types';
import { aggregate } from '../utils/aggregate';

interface Props {
  records: TreeRecord[];
}

export default function ResultTab({ records }: Props) {
  const validRecords = records.filter((r) => r.diameter > 0 && r.location.trim() !== '' && r.species !== '');

  if (validRecords.length === 0) {
    return (
      <p className="text-gray-400 dark:text-gray-500 py-12 text-center">
        집계할 데이터가 없습니다.
      </p>
    );
  }

  const result = aggregate(validRecords);

  const thCls = 'border border-gray-300 dark:border-gray-600 px-2 py-2 text-gray-700 dark:text-gray-300';
  const tdCls = 'border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center text-gray-800 dark:text-gray-200';

  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-4">
      <table className="border-collapse text-sm min-w-full">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-800">
            <th rowSpan={2} className={`${thCls} min-w-20`}>위치</th>
            {SPECIES_LIST.map((sp) => (
              <th
                key={sp}
                colSpan={DIAMETER_RANGES.length + 1}
                className={`${thCls} text-center`}
              >
                {sp}
              </th>
            ))}
            <th rowSpan={2} className={thCls}>합계</th>
          </tr>
          <tr className="bg-gray-50 dark:bg-gray-800/60">
            {SPECIES_LIST.map((sp) => (
              <Fragment key={sp}>
                {DIAMETER_RANGES.map((dr) => (
                  <th key={`${sp}-${dr}`} className={`${thCls} whitespace-nowrap text-center text-xs`}>
                    {DIAMETER_LABELS[dr]}
                  </th>
                ))}
                <th key={`${sp}-sub`} className={`${thCls} text-center font-bold`}>소계</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.location} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td className={`${tdCls} font-medium text-left`}>{row.location}</td>
              {SPECIES_LIST.map((sp) => (
                <Fragment key={sp}>
                  {DIAMETER_RANGES.map((dr) => (
                    <td key={`${row.location}-${sp}-${dr}`} className={tdCls}>
                      {row.counts[sp][dr] || ''}
                    </td>
                  ))}
                  <td
                    key={`${row.location}-${sp}-sub`}
                    className={`${tdCls} font-bold bg-gray-50 dark:bg-gray-800/40`}
                  >
                    {row.speciesSubtotals[sp] || ''}
                  </td>
                </Fragment>
              ))}
              <td className={`${tdCls} font-bold bg-blue-50 dark:bg-blue-900/20`}>
                {row.total}
              </td>
            </tr>
          ))}
          {/* 소계 행 */}
          <tr className="bg-yellow-50 dark:bg-yellow-900/20 font-bold">
            <td className={`${tdCls} text-left`}>소계</td>
            {SPECIES_LIST.map((sp) => (
              <Fragment key={sp}>
                {DIAMETER_RANGES.map((dr) => (
                  <td key={`total-${sp}-${dr}`} className={tdCls}>
                    {result.columnTotals[sp][dr] || ''}
                  </td>
                ))}
                <td
                  key={`total-${sp}-sub`}
                  className={`${tdCls} bg-yellow-100 dark:bg-yellow-900/30`}
                >
                  {result.speciesTotals[sp]}
                </td>
              </Fragment>
            ))}
            <td className={`${tdCls} bg-blue-100 dark:bg-blue-900/30`}>
              {result.grandTotal}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Fragment import
import { Fragment } from 'react';
