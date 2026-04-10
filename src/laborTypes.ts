export interface LaborProjectMeta {
  companyName: string;
  siteName: string;
  workYear: number;
  workMonth: number;
  managerName: string;
  paymentDate: string;
  workplaceManagementNumber: string;
  businessRegistrationNumber: string;
  companyAddress: string;
  companyPhone: string;
  companyPhoneMobile: string;
  companyFax: string;
  representativeName: string;
  managerResidentId: string;
  managerTitle: string;
  managerJobDescription: string;
}

export interface LaborProjectRecord extends LaborProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  sealed: boolean;
}

export interface LaborWorker {
  id: string;
  name: string;
  residentId: string;
  phone: string;
  address: string;
  dailyWage: number;
  employmentDurationType: 'under_1_month' | 'one_month_or_more';
  workplaceType: 'construction' | 'general';
  monthlyHours: number;
  jobType: string;
  teamName: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  calculationType: 'daily_tax' | 'daily_tax_with_employment' | 'manual';
  manualNationalPension: number;
  manualHealthInsurance: number;
  manualLongTermCare: number;
  manualOtherDeduction: number;
}

export interface LaborEntry {
  workerId: string;
  day: number;
  units: number;
  note?: string;
}

export interface LaborWorkerSummary {
  workerId: string;
  totalUnits: number;
  totalDays: number;
  grossPay: number;
  deduction: number;
  netPay: number;
}

export interface LaborCalculationBreakdown {
  incomeTax: number;
  localIncomeTax: number;
  employmentInsurance: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  otherDeduction: number;
  totalDeduction: number;
  netPay: number;
  notes: string[];
}

export interface LaborProjectBundle {
  project: LaborProjectRecord;
  workers: LaborWorker[];
  entries: LaborEntry[];
}
