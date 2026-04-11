import { supabase } from './supabase';
import type { LaborCompany, LaborEntry, LaborPoolWorker, LaborProjectBundle, LaborProjectRecord, LaborWorker } from '../laborTypes';

type LaborCompanyRow = {
  id: string;
  company_name: string;
  representative_name: string;
  business_registration_number: string;
  company_address: string;
  company_phone: string;
  company_phone_mobile: string;
  company_fax: string;
  workplace_management_number: string;
  created_at: string;
};

type LaborPoolWorkerRow = {
  id: string;
  name: string;
  resident_id: string;
  phone: string;
  address: string;
  job_type: string;
  team_name: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  employment_duration_type: 'under_1_month' | 'one_month_or_more';
  workplace_type: 'construction' | 'general';
  default_daily_wage: number;
  created_at: string;
};

type LaborProjectRow = {
  id: string;
  name: string;
  company_id: string | null;
  site_name: string;
  work_year: number;
  work_month: number;
  manager_name: string;
  payment_date: string | null;
  manager_resident_id: string;
  manager_title: string;
  manager_job_description: string;
  created_at: string;
  sealed: boolean;
};

type LaborWorkerRow = {
  id: string;
  project_id: string;
  pool_worker_id: string | null;
  name: string;
  resident_id: string;
  phone: string;
  address: string;
  daily_wage: number;
  employment_duration_type: 'under_1_month' | 'one_month_or_more';
  workplace_type: 'construction' | 'general';
  monthly_hours: number;
  job_type: string;
  team_name: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  calculation_type: 'daily_tax' | 'daily_tax_with_employment' | 'manual';
  manual_national_pension: number;
  manual_health_insurance: number;
  manual_long_term_care: number;
  manual_other_deduction: number;
  sort_order: number;
};

type LaborEntryRow = {
  id: number;
  project_id: string;
  worker_id: string;
  day: number;
  units: number;
  note: string;
};

function mapCompany(row: LaborCompanyRow): LaborCompany {
  return {
    id: row.id,
    companyName: row.company_name ?? '',
    representativeName: row.representative_name ?? '',
    businessRegistrationNumber: row.business_registration_number ?? '',
    companyAddress: row.company_address ?? '',
    companyPhone: row.company_phone ?? '',
    companyPhoneMobile: row.company_phone_mobile ?? '',
    companyFax: row.company_fax ?? '',
    workplaceManagementNumber: row.workplace_management_number ?? '',
  };
}

function mapPoolWorker(row: LaborPoolWorkerRow): LaborPoolWorker {
  return {
    id: row.id,
    name: row.name ?? '',
    residentId: row.resident_id ?? '',
    phone: row.phone ?? '',
    address: row.address ?? '',
    jobType: row.job_type ?? '',
    teamName: row.team_name ?? '',
    bankName: row.bank_name ?? '',
    accountNumber: row.account_number ?? '',
    accountHolder: row.account_holder ?? '',
    employmentDurationType: row.employment_duration_type ?? 'under_1_month',
    workplaceType: row.workplace_type ?? 'construction',
    defaultDailyWage: Number(row.default_daily_wage ?? 0),
  };
}

function mapProject(row: LaborProjectRow): LaborProjectRecord {
  return {
    id: row.id,
    name: row.name ?? '',
    companyId: row.company_id ?? null,
    siteName: row.site_name ?? '',
    workYear: row.work_year,
    workMonth: row.work_month,
    managerName: row.manager_name ?? '',
    paymentDate: row.payment_date ?? '',
    managerResidentId: row.manager_resident_id ?? '',
    managerTitle: row.manager_title ?? '',
    managerJobDescription: row.manager_job_description ?? '',
    createdAt: row.created_at,
    sealed: row.sealed ?? false,
  };
}

function mapWorker(row: LaborWorkerRow): LaborWorker {
  return {
    id: row.id,
    poolWorkerId: row.pool_worker_id ?? null,
    name: row.name ?? '',
    residentId: row.resident_id ?? '',
    phone: row.phone ?? '',
    address: row.address ?? '',
    dailyWage: Number(row.daily_wage ?? 0),
    employmentDurationType: row.employment_duration_type ?? 'under_1_month',
    workplaceType: row.workplace_type ?? 'construction',
    monthlyHours: Number(row.monthly_hours ?? 0),
    jobType: row.job_type ?? '',
    teamName: row.team_name ?? '',
    bankName: row.bank_name ?? '',
    accountNumber: row.account_number ?? '',
    accountHolder: row.account_holder ?? '',
    calculationType: row.calculation_type ?? 'daily_tax',
    manualNationalPension: Number(row.manual_national_pension ?? 0),
    manualHealthInsurance: Number(row.manual_health_insurance ?? 0),
    manualLongTermCare: Number(row.manual_long_term_care ?? 0),
    manualOtherDeduction: Number(row.manual_other_deduction ?? 0),
  };
}

function mapEntry(row: LaborEntryRow): LaborEntry {
  return {
    workerId: row.worker_id,
    day: row.day,
    units: Number(row.units ?? 0),
    note: row.note ?? '',
  };
}

// --- Company CRUD ---

export async function listLaborCompanies(): Promise<LaborCompany[]> {
  const { data, error } = await supabase
    .from('labor_companies')
    .select('*')
    .is('deleted_at', null)
    .order('company_name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapCompany(row as LaborCompanyRow));
}

export async function saveLaborCompany(company: LaborCompany): Promise<LaborCompany> {
  const id = company.id || crypto.randomUUID();
  const payload = {
    id,
    company_name: company.companyName,
    representative_name: company.representativeName,
    business_registration_number: company.businessRegistrationNumber,
    company_address: company.companyAddress,
    company_phone: company.companyPhone,
    company_phone_mobile: company.companyPhoneMobile,
    company_fax: company.companyFax,
    workplace_management_number: company.workplaceManagementNumber,
  };

  const { data, error } = await supabase
    .from('labor_companies')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  return mapCompany(data as LaborCompanyRow);
}

export async function archiveLaborCompany(id: string): Promise<void> {
  const { error } = await supabase
    .from('labor_companies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// --- Pool Worker CRUD ---

export async function listLaborPoolWorkers(): Promise<LaborPoolWorker[]> {
  const { data, error } = await supabase
    .from('labor_worker_pool')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapPoolWorker(row as LaborPoolWorkerRow));
}

export async function saveLaborPoolWorker(worker: LaborPoolWorker): Promise<LaborPoolWorker> {
  const id = worker.id || crypto.randomUUID();
  const payload = {
    id,
    name: worker.name,
    resident_id: worker.residentId,
    phone: worker.phone,
    address: worker.address,
    job_type: worker.jobType,
    team_name: worker.teamName,
    bank_name: worker.bankName,
    account_number: worker.accountNumber,
    account_holder: worker.accountHolder,
    employment_duration_type: worker.employmentDurationType,
    workplace_type: worker.workplaceType,
    default_daily_wage: worker.defaultDailyWage,
  };

  const { data, error } = await supabase
    .from('labor_worker_pool')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  return mapPoolWorker(data as LaborPoolWorkerRow);
}

export async function archiveLaborPoolWorker(id: string): Promise<void> {
  const { error } = await supabase
    .from('labor_worker_pool')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// --- Project CRUD ---

export async function listLaborProjects(): Promise<LaborProjectRecord[]> {
  const { data, error } = await supabase
    .from('labor_projects')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapProject(row as LaborProjectRow));
}

export async function createLaborProject(name: string, companyId?: string): Promise<LaborProjectRecord> {
  const now = new Date();
  const { data, error } = await supabase
    .from('labor_projects')
    .insert({
      name,
      company_id: companyId ?? null,
      work_year: now.getFullYear(),
      work_month: now.getMonth() + 1,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapProject(data as LaborProjectRow);
}

export async function archiveLaborProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('labor_projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) throw error;
}

export async function getLaborProjectBundle(projectId: string): Promise<LaborProjectBundle> {
  const { data: projectData, error: projectError } = await supabase
    .from('labor_projects')
    .select('*')
    .eq('id', projectId)
    .is('deleted_at', null)
    .single();
  if (projectError) throw projectError;

  const project = mapProject(projectData as LaborProjectRow);

  let company: LaborCompany | null = null;
  if (project.companyId) {
    const { data: companyData, error: companyError } = await supabase
      .from('labor_companies')
      .select('*')
      .eq('id', project.companyId)
      .single();
    if (companyError) {
      console.warn('Failed to load company:', companyError.message);
    } else if (companyData) {
      company = mapCompany(companyData as LaborCompanyRow);
    }
  }

  const { data: workerData, error: workerError } = await supabase
    .from('labor_workers')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (workerError) throw workerError;

  const { data: entryData, error: entryError } = await supabase
    .from('labor_entries')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('worker_id', { ascending: true })
    .order('day', { ascending: true });
  if (entryError) throw entryError;

  return {
    project,
    workers: (workerData ?? []).map((row) => mapWorker(row as LaborWorkerRow)),
    entries: (entryData ?? []).map((row) => mapEntry(row as LaborEntryRow)),
    company,
  };
}

export async function saveLaborProjectBundle(
  project: LaborProjectRecord,
  workers: LaborWorker[],
  entries: LaborEntry[],
): Promise<void> {
  const { error: projectError } = await supabase
    .from('labor_projects')
    .update({
      name: project.name,
      company_id: project.companyId,
      site_name: project.siteName,
      work_year: project.workYear,
      work_month: project.workMonth,
      manager_name: project.managerName,
      payment_date: project.paymentDate || null,
      manager_resident_id: project.managerResidentId,
      manager_title: project.managerTitle,
      manager_job_description: project.managerJobDescription,
    })
    .eq('id', project.id);

  if (projectError) throw projectError;

  const { error: deleteEntriesError } = await supabase
    .from('labor_entries')
    .delete()
    .eq('project_id', project.id);
  if (deleteEntriesError) throw deleteEntriesError;

  const { error: deleteWorkersError } = await supabase
    .from('labor_workers')
    .delete()
    .eq('project_id', project.id);
  if (deleteWorkersError) throw deleteWorkersError;

  if (workers.length > 0) {
    const workerPayload = workers.map((worker, index) => ({
      id: worker.id,
      project_id: project.id,
      pool_worker_id: worker.poolWorkerId,
      name: worker.name,
      resident_id: worker.residentId,
      phone: worker.phone,
      address: worker.address,
      daily_wage: worker.dailyWage,
      employment_duration_type: worker.employmentDurationType,
      workplace_type: worker.workplaceType,
      monthly_hours: worker.monthlyHours,
      job_type: worker.jobType,
      team_name: worker.teamName,
      bank_name: worker.bankName,
      account_number: worker.accountNumber,
      account_holder: worker.accountHolder,
      calculation_type: worker.calculationType,
      manual_national_pension: worker.manualNationalPension,
      manual_health_insurance: worker.manualHealthInsurance,
      manual_long_term_care: worker.manualLongTermCare,
      manual_other_deduction: worker.manualOtherDeduction,
      sort_order: index,
    }));

    const { error: insertWorkersError } = await supabase
      .from('labor_workers')
      .insert(workerPayload);
    if (insertWorkersError) throw insertWorkersError;
  }

  if (entries.length > 0) {
    const entryPayload = entries
      .filter((entry) => workers.some((worker) => worker.id === entry.workerId))
      .map((entry) => ({
        project_id: project.id,
        worker_id: entry.workerId,
        day: entry.day,
        units: entry.units,
        note: entry.note ?? '',
      }));

    if (entryPayload.length > 0) {
      const { error: insertEntriesError } = await supabase
        .from('labor_entries')
        .insert(entryPayload);
      if (insertEntriesError) throw insertEntriesError;
    }
  }
}
