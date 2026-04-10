import type {
  LaborCalculationBreakdown,
  LaborEntry,
  LaborProjectMeta,
  LaborProjectRecord,
  LaborWorker,
  LaborWorkerSummary,
} from '../laborTypes';

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildInitialLaborMeta(): LaborProjectMeta {
  const now = new Date();
  return {
    companyName: '',
    siteName: '',
    workYear: now.getFullYear(),
    workMonth: now.getMonth() + 1,
    managerName: '',
    paymentDate: '',
    workplaceManagementNumber: '',
    businessRegistrationNumber: '',
    companyAddress: '',
    companyPhone: '',
    companyPhoneMobile: '',
    companyFax: '',
    representativeName: '',
    managerResidentId: '',
    managerTitle: '',
    managerJobDescription: '',
  };
}

export function metaFromProject(project: LaborProjectRecord): LaborProjectMeta {
  return {
    companyName: project.companyName,
    siteName: project.siteName,
    workYear: project.workYear,
    workMonth: project.workMonth,
    managerName: project.managerName,
    paymentDate: project.paymentDate,
    workplaceManagementNumber: project.workplaceManagementNumber,
    businessRegistrationNumber: project.businessRegistrationNumber,
    companyAddress: project.companyAddress,
    companyPhone: project.companyPhone,
    companyPhoneMobile: project.companyPhoneMobile ?? '',
    companyFax: project.companyFax ?? '',
    representativeName: project.representativeName,
    managerResidentId: project.managerResidentId ?? '',
    managerTitle: project.managerTitle ?? '',
    managerJobDescription: project.managerJobDescription ?? '',
  };
}

export function buildLaborWorker(): LaborWorker {
  return {
    id: crypto.randomUUID(),
    name: '',
    residentId: '',
    phone: '',
    address: '',
    dailyWage: 0,
    employmentDurationType: 'under_1_month',
    workplaceType: 'construction',
    monthlyHours: 0,
    jobType: '',
    teamName: '',
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    calculationType: 'daily_tax',
    manualNationalPension: 0,
    manualHealthInsurance: 0,
    manualLongTermCare: 0,
    manualOtherDeduction: 0,
  };
}

export function sanitizeUnits(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 2) / 2;
}

export function updateLaborEntry(entries: LaborEntry[], workerId: string, day: number, units: number): LaborEntry[] {
  const nextUnits = sanitizeUnits(units);
  const next = entries.filter((entry) => !(entry.workerId === workerId && entry.day === day));
  if (nextUnits <= 0) return next;
  return [...next, { workerId, day, units: nextUnits }];
}

export function getLaborEntryUnits(entries: LaborEntry[], workerId: string, day: number): number {
  return entries.find((entry) => entry.workerId === workerId && entry.day === day)?.units ?? 0;
}

export function summarizeLabor(workers: LaborWorker[], entries: LaborEntry[]): LaborWorkerSummary[] {
  return workers.map((worker) => {
    const workerEntries = entries.filter((entry) => entry.workerId === worker.id);
    const totalUnits = workerEntries.reduce((sum, entry) => sum + entry.units, 0);
    const grossPay = totalUnits * worker.dailyWage;
    return {
      workerId: worker.id,
      totalUnits,
      totalDays: workerEntries.filter((entry) => entry.units > 0).length,
      grossPay,
      deduction: 0,
      netPay: grossPay,
    };
  });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value));
}

export function normalizeResidentId(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function normalizeBusinessNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function normalizeWorkplaceManagementNumber(value: string): string {
  return value.replace(/[^0-9-]/g, '').slice(0, 32);
}

export function isResidentIdFormat(value: string): boolean {
  return /^\d{6}-\d{7}$/.test(value);
}

export function isPhoneFormat(value: string): boolean {
  return /^0\d{1,2}-\d{3,4}-\d{4}$/.test(value);
}

export function isBusinessNumberFormat(value: string): boolean {
  return /^\d{3}-\d{2}-\d{5}$/.test(value);
}

function roundWon(value: number): number {
  return Math.round(value);
}

function roundDownToThousand(value: number): number {
  return Math.floor(value / 1000) * 1000;
}

export function calculateDeductions(worker: LaborWorker, grossPay: number, totalDays = 0): LaborCalculationBreakdown {
  const notes: string[] = [];

  if (worker.calculationType === 'manual') {
    notes.push('수동 검토 유형은 자동 공제를 적용하지 않고 수동 입력값만 사용합니다.');
    return {
      incomeTax: 0,
      localIncomeTax: 0,
      employmentInsurance: 0,
      nationalPension: worker.manualNationalPension,
      healthInsurance: worker.manualHealthInsurance,
      longTermCare: worker.manualLongTermCare,
      otherDeduction: worker.manualOtherDeduction,
      totalDeduction: worker.manualNationalPension + worker.manualHealthInsurance + worker.manualLongTermCare + worker.manualOtherDeduction,
      netPay: grossPay - worker.manualNationalPension - worker.manualHealthInsurance - worker.manualLongTermCare - worker.manualOtherDeduction,
      notes,
    };
  }

  const taxableBase = Math.max(0, grossPay - 150000);
  const incomeTax = grossPay > 150000 ? roundWon(taxableBase * 0.06 * 0.45) : 0;
  const localIncomeTax = roundWon(incomeTax * 0.1);
  const employmentInsurance = worker.calculationType === 'daily_tax_with_employment' ? roundWon(grossPay * 0.009) : 0;

  if (worker.calculationType === 'daily_tax') notes.push('일용 소득세와 지방소득세를 자동 계산합니다.');
  if (worker.calculationType === 'daily_tax_with_employment') notes.push('일용 소득세, 지방소득세, 고용보험을 자동 계산합니다.');

  const pensionEligible = worker.employmentDurationType === 'one_month_or_more' && (totalDays >= 8 || (worker.workplaceType === 'general' && worker.monthlyHours >= 60));
  const healthEligible = worker.employmentDurationType === 'one_month_or_more';

  const autoNationalPension = pensionEligible ? roundWon(roundDownToThousand(grossPay) * 0.0475) : 0;
  const autoHealthInsurance = healthEligible ? roundWon(grossPay * 0.03595) : 0;
  const autoLongTermCare = healthEligible ? roundWon(autoHealthInsurance * 0.1314) : 0;

  const nationalPension = autoNationalPension + worker.manualNationalPension;
  const healthInsurance = autoHealthInsurance + worker.manualHealthInsurance;
  const longTermCare = autoLongTermCare + worker.manualLongTermCare;
  const otherDeduction = worker.manualOtherDeduction;

  notes.push(
    pensionEligible
      ? '국민연금은 1개월 이상 근로와 월 8일 이상 또는 일반현장 60시간 이상 기준으로 자동 계산했습니다.'
      : '국민연금은 입력된 고용기간·일수·시간 기준으로 자동 적용하지 않았습니다.',
  );
  notes.push(
    healthEligible
      ? '건강보험과 장기요양보험은 1개월 이상 근로로 입력되어 자동 계산했습니다.'
      : '건강보험과 장기요양보험은 1개월 미만 근로로 입력되어 자동 적용하지 않았습니다.',
  );
  if (worker.manualNationalPension || worker.manualHealthInsurance || worker.manualLongTermCare || worker.manualOtherDeduction) {
    notes.push('수동 공제 입력값은 자동 계산 결과에 추가 반영했습니다.');
  }

  const totalDeduction = incomeTax + localIncomeTax + employmentInsurance + nationalPension + healthInsurance + longTermCare + otherDeduction;
  return {
    incomeTax,
    localIncomeTax,
    employmentInsurance,
    nationalPension,
    healthInsurance,
    longTermCare,
    otherDeduction,
    totalDeduction,
    netPay: grossPay - totalDeduction,
    notes,
  };
}
