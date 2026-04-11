import { useEffect, useMemo, useState } from 'react';
import type { LaborCompany, LaborEntry, LaborPoolWorker, LaborProjectMeta, LaborProjectRecord, LaborResolvedMeta, LaborWorker } from '../laborTypes';
import {
  buildInitialLaborMeta,
  buildLaborWorker,
  buildResolvedMeta,
  buildWorkerFromPool,
  calculateDeductions,
  formatCurrency,
  getDaysInMonth,
  getLaborEntryUnits,
  isBusinessNumberFormat,
  isPhoneFormat,
  isResidentIdFormat,
  metaFromProject,
  normalizeBusinessNumber,
  normalizePhone,
  normalizeResidentId,
  normalizeWorkplaceManagementNumber,
  summarizeLabor,
  updateLaborEntry,
} from '../utils/labor';
import {
  archiveLaborCompany,
  archiveLaborPoolWorker,
  archiveLaborProject,
  createLaborProject,
  getLaborProjectBundle,
  listLaborCompanies,
  listLaborPoolWorkers,
  listLaborProjects,
  saveLaborCompany,
  saveLaborPoolWorker,
  saveLaborProjectBundle,
} from '../lib/laborSupabase';
import LaborLedgerDocument from './LaborLedgerDocument';
import LaborPrintSheets from './LaborPrintSheets';
import LaborCalibrator from './LaborCalibrator';

type LaborTab = 'companies' | 'pool' | 'project' | 'entries' | 'ledger' | 'report';
type NoticeTone = 'info' | 'success' | 'error';

const CALCULATION_TYPE_OPTIONS: Array<{ value: LaborWorker['calculationType']; label: string; desc: string }> = [
  { value: 'daily_tax', label: '일용 원천세', desc: '일용근로 소득세와 지방소득세를 자동 계산합니다.' },
  { value: 'daily_tax_with_employment', label: '일용+고용보험', desc: '소득세, 지방소득세, 고용보험을 자동 계산합니다.' },
  { value: 'manual', label: '수동 검토', desc: '자동 공제를 적용하지 않고 수동 공제 입력값만 사용합니다.' },
];

const DURATION_OPTIONS: Array<{ value: LaborWorker['employmentDurationType']; label: string }> = [
  { value: 'under_1_month', label: '1개월 미만' },
  { value: 'one_month_or_more', label: '1개월 이상' },
];

const WORKPLACE_OPTIONS: Array<{ value: LaborWorker['workplaceType']; label: string }> = [
  { value: 'construction', label: '건설현장' },
  { value: 'general', label: '일반사업장' },
];

function buildLedgerRows(workers: LaborWorker[], entries: LaborEntry[]) {
  const summary = summarizeLabor(workers, entries);
  return workers.map((worker) => {
    const basic = summary.find((item) => item.workerId === worker.id);
    const grossPay = basic?.grossPay ?? 0;
    const totalDays = basic?.totalDays ?? 0;
    return {
      worker,
      totalUnits: basic?.totalUnits ?? 0,
      totalDays,
      grossPay,
      ...calculateDeductions(worker, grossPay, totalDays),
    };
  });
}

function buildEmptyCompany(): LaborCompany {
  return {
    id: '',
    companyName: '',
    representativeName: '',
    businessRegistrationNumber: '',
    companyAddress: '',
    companyPhone: '',
    companyPhoneMobile: '',
    companyFax: '',
    workplaceManagementNumber: '',
  };
}

function buildEmptyPoolWorker(): LaborPoolWorker {
  return {
    id: '',
    name: '',
    residentId: '',
    phone: '',
    address: '',
    jobType: '',
    teamName: '',
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    employmentDurationType: 'under_1_month',
    workplaceType: 'construction',
    defaultDailyWage: 0,
  };
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  required = false,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-gray-500 dark:text-gray-400">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </div>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-gray-500 dark:text-gray-400">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </div>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Notice({ tone, message }: { tone: NoticeTone; message: string }) {
  const className =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300';

  return <div className={`rounded-xl border px-3 py-2 text-sm ${className}`}>{message}</div>;
}

export default function LaborWorkbench() {
  const [activeTab, setActiveTab] = useState<LaborTab>('companies');
  const [projects, setProjects] = useState<LaborProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('노무비 프로젝트');
  const [meta, setMeta] = useState<LaborProjectMeta>(buildInitialLaborMeta);
  const [workers, setWorkers] = useState<LaborWorker[]>([buildLaborWorker()]);
  const [entries, setEntries] = useState<LaborEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [selectedEntryCell, setSelectedEntryCell] = useState<{ workerId: string; day: number } | null>(null);
  const [printMode, setPrintMode] = useState<'ledger' | 'report' | null>(null);
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
  const [reportPdfUrl, setReportPdfUrl] = useState<string | null>(null);
  const [reportPdfLoading, setReportPdfLoading] = useState(false);
  const [showCalibrator, setShowCalibrator] = useState(false);

  // Company master state
  const [companies, setCompanies] = useState<LaborCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<LaborCompany | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingCompanyDraft, setEditingCompanyDraft] = useState<LaborCompany | null>(null);
  const [companySaving, setCompanySaving] = useState(false);

  // Pool worker state
  const [poolWorkers, setPoolWorkers] = useState<LaborPoolWorker[]>([]);
  const [editingPoolWorkerId, setEditingPoolWorkerId] = useState<string | null>(null);
  const [editingPoolWorkerDraft, setEditingPoolWorkerDraft] = useState<LaborPoolWorker | null>(null);
  const [poolWorkerSaving, setPoolWorkerSaving] = useState(false);

  // Pool picker modal state (for adding workers to project from pool)
  const [showPoolPicker, setShowPoolPicker] = useState(false);
  const [poolPickerSelected, setPoolPickerSelected] = useState<Set<string>>(new Set());

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const validWorkers = useMemo(() => workers.filter((worker) => worker.name.trim() !== ''), [workers]);
  const days = useMemo(() => Array.from({ length: getDaysInMonth(meta.workYear, meta.workMonth) }, (_, index) => index + 1), [meta.workMonth, meta.workYear]);
  const ledgerRows = useMemo(() => buildLedgerRows(workers, entries), [workers, entries]);
  const totals = useMemo(
    () => ledgerRows.reduce(
      (acc, row) => ({
        totalUnits: acc.totalUnits + row.totalUnits,
        grossPay: acc.grossPay + row.grossPay,
        incomeTax: acc.incomeTax + row.incomeTax,
        localIncomeTax: acc.localIncomeTax + row.localIncomeTax,
        employmentInsurance: acc.employmentInsurance + row.employmentInsurance,
        nationalPension: acc.nationalPension + row.nationalPension,
        healthInsurance: acc.healthInsurance + row.healthInsurance,
        longTermCare: acc.longTermCare + row.longTermCare,
        otherDeduction: acc.otherDeduction + row.otherDeduction,
        totalDeduction: acc.totalDeduction + row.totalDeduction,
        netPay: acc.netPay + row.netPay,
      }),
      { totalUnits: 0, grossPay: 0, incomeTax: 0, localIncomeTax: 0, employmentInsurance: 0, nationalPension: 0, healthInsurance: 0, longTermCare: 0, otherDeduction: 0, totalDeduction: 0, netPay: 0 },
    ),
    [ledgerRows],
  );

  const resolvedMeta = useMemo<LaborResolvedMeta>(
    () => buildResolvedMeta(meta, selectedCompany),
    [meta, selectedCompany],
  );

  const reportRows = useMemo(
    () => validWorkers.map((worker) => {
      const workedEntries = entries.filter((entry) => entry.workerId === worker.id && entry.units > 0).sort((a, b) => a.day - b.day);
      const missingFields: string[] = [];
      if (!worker.residentId.trim()) missingFields.push('주민번호/외국인등록번호');
      if (!worker.phone.trim()) missingFields.push('연락처');
      if (!worker.address.trim()) missingFields.push('주소');
      if (!worker.jobType.trim()) missingFields.push('직종');
      if (!resolvedMeta.workplaceManagementNumber.trim()) missingFields.push('사업장관리번호');
      if (!resolvedMeta.businessRegistrationNumber.trim()) missingFields.push('사업자등록번호');
      if (!resolvedMeta.companyName.trim()) missingFields.push('회사명');
      if (!resolvedMeta.siteName.trim()) missingFields.push('현장명');
      if (!resolvedMeta.managerName.trim()) missingFields.push('현장책임자');
      if (!resolvedMeta.companyAddress.trim()) missingFields.push('회사주소');
      if (!resolvedMeta.companyPhone.trim()) missingFields.push('회사전화번호');
      if (!resolvedMeta.representativeName.trim()) missingFields.push('대표자명');
      if (!resolvedMeta.paymentDate.trim()) missingFields.push('지급일');
      return {
        worker,
        ledger: ledgerRows.find((row) => row.worker.id === worker.id),
        workedDays: workedEntries.map((entry) => entry.day),
        workedDayCount: workedEntries.length,
        missingFields,
      };
    }),
    [entries, ledgerRows, resolvedMeta, validWorkers],
  );
  const reportMissingFields = useMemo(
    () => Array.from(new Set(reportRows.flatMap((row) => row.missingFields))),
    [reportRows],
  );
  const reportReady = reportRows.length > 0 && reportMissingFields.length === 0;

  const loadProjectList = async (nextSelectedId?: string | null) => {
    const list = await listLaborProjects();
    setProjects(list);
    if (typeof nextSelectedId !== 'undefined') setSelectedProjectId(nextSelectedId);
    else if (!selectedProjectId && list.length > 0) setSelectedProjectId(list[0].id);
  };

  useEffect(() => {
    void (async () => {
      try {
        const [list, loadedCompanies, loadedPool] = await Promise.all([
          listLaborProjects(),
          listLaborCompanies(),
          listLaborPoolWorkers(),
        ]);
        setProjects(list);
        setCompanies(loadedCompanies);
        setPoolWorkers(loadedPool);
        if (list.length > 0) setSelectedProjectId(list[0].id);
      } catch (error) {
        console.error('LaborWorkbench list:', error);
        setNotice({ tone: 'error', message: '노무비 데이터를 불러오지 못했습니다.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    void (async () => {
      try {
        const bundle = await getLaborProjectBundle(selectedProjectId);
        setProjectName(bundle.project.name);
        setMeta(metaFromProject(bundle.project));
        setWorkers(bundle.workers.length > 0 ? bundle.workers : [buildLaborWorker()]);
        setEntries(bundle.entries);
        setSelectedEntryCell(null);
        setNotice(null);
        setSelectedCompany(bundle.company);
      } catch (error) {
        console.error('LaborWorkbench load:', error);
        setNotice({ tone: 'error', message: '노무비 프로젝트를 불러오지 못했습니다.' });
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedProjectId]);

  useEffect(() => {
    const clearPrintMode = () => setPrintMode(null);
    window.addEventListener('afterprint', clearPrintMode);
    return () => window.removeEventListener('afterprint', clearPrintMode);
  }, []);

  useEffect(() => {
    if (activeTab !== 'report') return;
    if (!reportReady) {
      setReportPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setReportPdfLoading(false);
      return;
    }

    let cancelled = false;
    setReportPdfLoading(true);

    void (async () => {
      try {
        const { generateLaborReportPdf } = await import('../utils/laborReportPdf');
        const pdfBytes = await generateLaborReportPdf({ meta: resolvedMeta, reportRows });
        const nextUrl = URL.createObjectURL(new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }));
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        setReportPdfUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
      } catch (error) {
        console.error('LaborWorkbench report preview:', error);
        if (!cancelled) setNotice({ tone: 'error', message: '신고서 PDF 미리보기 생성에 실패했습니다.' });
      } finally {
        if (!cancelled) setReportPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, resolvedMeta, reportReady, reportRows]);

  useEffect(() => {
    return () => {
      if (reportPdfUrl) URL.revokeObjectURL(reportPdfUrl);
    };
  }, [reportPdfUrl]);

  const setMetaField = (field: keyof LaborProjectMeta, value: string) => {
    setMeta((prev) => ({
      ...prev,
      [field]:
        field === 'workYear' || field === 'workMonth'
          ? Number(value || 0)
          : value,
    }));
  };

  const updateWorker = (id: string, field: keyof LaborWorker, value: string) => {
    setWorkers((prev) => prev.map((worker) => {
      if (worker.id !== id) return worker;
      const numericFields: Array<keyof LaborWorker> = ['dailyWage', 'monthlyHours', 'manualNationalPension', 'manualHealthInsurance', 'manualLongTermCare', 'manualOtherDeduction'];
      const nextValue =
        numericFields.includes(field)
          ? Number(value || 0)
          : field === 'residentId'
            ? normalizeResidentId(value)
            : field === 'phone'
              ? normalizePhone(value)
              : value;
      return { ...worker, [field]: nextValue } as LaborWorker;
    }));
  };

  const addWorker = () => setWorkers((prev) => [...prev, buildLaborWorker()]);
  const removeWorker = (id: string) => {
    setWorkers((prev) => (prev.length > 1 ? prev.filter((worker) => worker.id !== id) : prev));
    setEntries((prev) => prev.filter((entry) => entry.workerId !== id));
    if (selectedEntryCell?.workerId === id) setSelectedEntryCell(null);
  };
  const applyUnits = (workerId: string, day: number, units: number) => {
    setEntries((prev) => updateLaborEntry(prev, workerId, day, units));
    setSelectedEntryCell({ workerId, day });
  };
  const toggleDay = (workerId: string, day: number) => {
    const currentUnits = getLaborEntryUnits(entries, workerId, day);
    applyUnits(workerId, day, currentUnits > 0 ? 0 : 1);
  };
  const fillWeekdays = (workerId: string) => {
    let nextEntries = entries.filter((entry) => entry.workerId !== workerId);
    for (const day of days) {
      const weekday = new Date(meta.workYear, meta.workMonth - 1, day).getDay();
      if (weekday !== 0 && weekday !== 6) nextEntries = updateLaborEntry(nextEntries, workerId, day, 1);
    }
    setEntries(nextEntries);
  };
  const clearWorkerDays = (workerId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.workerId !== workerId));
    if (selectedEntryCell?.workerId === workerId) setSelectedEntryCell(null);
  };

  const validateBeforeSave = () => {
    if (!selectedProject) return '먼저 노무비 프로젝트를 선택해 주세요.';
    if (!projectName.trim()) return '프로젝트명을 입력해 주세요.';
    if (!meta.companyId || !selectedCompany) return '회사를 선택해 주세요.';
    if (!resolvedMeta.companyName.trim()) return '회사명을 입력해 주세요.';
    if (!meta.siteName.trim()) return '현장명을 입력해 주세요.';
    if (!resolvedMeta.workplaceManagementNumber.trim()) return '사업장관리번호를 입력해 주세요.';
    if (!resolvedMeta.businessRegistrationNumber.trim()) return '사업자등록번호를 입력해 주세요.';
    if (!meta.managerName.trim()) return '현장책임자를 입력해 주세요.';
    if (!resolvedMeta.representativeName.trim()) return '대표자명을 입력해 주세요.';
    if (!resolvedMeta.companyPhone.trim()) return '회사 전화번호를 입력해 주세요.';
    if (!resolvedMeta.companyAddress.trim()) return '회사 주소를 입력해 주세요.';
    if (!meta.paymentDate.trim()) return '지급일을 입력해 주세요.';
    if (!isBusinessNumberFormat(resolvedMeta.businessRegistrationNumber.trim())) return '사업자등록번호 형식은 000-00-00000 이어야 합니다.';
    if (resolvedMeta.companyPhone.trim() && !isPhoneFormat(resolvedMeta.companyPhone.trim())) return '회사 전화번호 형식을 확인해 주세요.';
    if (validWorkers.length === 0) return '이름이 있는 근로자를 최소 1명 입력해 주세요.';
    if (validWorkers.some((worker) => worker.dailyWage <= 0)) return '일급은 0원보다 커야 합니다.';
    if (validWorkers.some((worker) => !isResidentIdFormat(worker.residentId.trim()))) return '주민번호/외국인등록번호는 13자리(000000-0000000)로 입력해 주세요.';
    if (validWorkers.some((worker) => worker.phone.trim() && !isPhoneFormat(worker.phone.trim()))) return '근로자 연락처 형식을 확인해 주세요.';
    return null;
  };

  const handlePrintReport = () => {
    void (async () => {
      if (!reportReady) {
        setNotice({ tone: 'error', message: `신고서 생성 전 입력 필요: ${reportMissingFields.join(', ')}` });
        return;
      }
      try {
        let url = reportPdfUrl;
        if (!url) {
          const { generateLaborReportPdf } = await import('../utils/laborReportPdf');
          const pdfBytes = await generateLaborReportPdf({ meta: resolvedMeta, reportRows });
          url = URL.createObjectURL(new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }));
          setReportPdfUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return url!;
          });
        }
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
        setNotice({ tone: 'success', message: '현행 PDF 양식으로 신고서를 생성했습니다.' });
      } catch (error) {
        console.error('LaborWorkbench report pdf:', error);
        setNotice({ tone: 'error', message: '신고서 PDF 생성에 실패했습니다.' });
      }
    })();
  };

  const handlePrintLedger = () => {
    if (ledgerRows.length === 0) {
      setNotice({ tone: 'info', message: '출력할 노무비대장 데이터가 없습니다.' });
      return;
    }
    setPrintMode('ledger');
    window.setTimeout(() => window.print(), 50);
  };

  const handleCreateProject = async () => {
    const name = window.prompt('새 노무비 프로젝트 이름', projectName);
    if (!name?.trim()) return;
    try {
      const created = await createLaborProject(name.trim(), meta.companyId ?? undefined);
      await loadProjectList(created.id);
      setProjectName(created.name);
      setMeta(metaFromProject(created));
      setWorkers([buildLaborWorker()]);
      setEntries([]);
      setNotice({ tone: 'success', message: '노무비 프로젝트를 생성했습니다.' });
    } catch (error) {
      console.error('LaborWorkbench create:', error);
      setNotice({ tone: 'error', message: '노무비 프로젝트 생성에 실패했습니다.' });
    }
  };

  const handleArchiveProject = async () => {
    if (!selectedProject || !window.confirm(`"${selectedProject.name}" 프로젝트를 보관할까요?`)) return;
    try {
      await archiveLaborProject(selectedProject.id);
      const nextProjects = projects.filter((project) => project.id !== selectedProject.id);
      setProjects(nextProjects);
      setSelectedProjectId(nextProjects[0]?.id ?? null);
      setNotice({ tone: 'success', message: '프로젝트를 보관했습니다.' });
    } catch (error) {
      console.error('LaborWorkbench archive:', error);
      setNotice({ tone: 'error', message: '프로젝트 보관에 실패했습니다.' });
    }
  };

  const handleSave = async () => {
    const validationError = validateBeforeSave();
    if (validationError || !selectedProject) {
      if (validationError) setNotice({ tone: 'error', message: validationError });
      return;
    }
    setSaving(true);
    try {
      const nextProject: LaborProjectRecord = {
        ...selectedProject,
        name: projectName.trim(),
        companyId: meta.companyId,
        siteName: meta.siteName.trim(),
        workYear: meta.workYear,
        workMonth: meta.workMonth,
        managerName: meta.managerName.trim(),
        paymentDate: meta.paymentDate,
        managerResidentId: meta.managerResidentId.trim(),
        managerTitle: meta.managerTitle.trim(),
        managerJobDescription: meta.managerJobDescription.trim(),
      };
      const cleanedWorkers = workers
        .filter((worker) => worker.name.trim() !== '')
        .map((worker) => ({
          ...worker,
          name: worker.name.trim(),
          residentId: worker.residentId.trim(),
          phone: worker.phone.trim(),
          address: worker.address.trim(),
          jobType: worker.jobType.trim(),
          teamName: worker.teamName.trim(),
          bankName: worker.bankName.trim(),
          accountNumber: worker.accountNumber.trim(),
          accountHolder: worker.accountHolder.trim(),
        }));
      await saveLaborProjectBundle(nextProject, cleanedWorkers, entries);
      await loadProjectList(nextProject.id);
      setWorkers(cleanedWorkers.length > 0 ? cleanedWorkers : [buildLaborWorker()]);
      setNotice({ tone: 'success', message: 'Supabase에 노무비 데이터를 저장했습니다.' });
    } catch (error) {
      console.error('LaborWorkbench save:', error);
      setNotice({ tone: 'error', message: '노무비 데이터 저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  // Company CRUD handlers
  const startEditCompany = (company: LaborCompany) => {
    setEditingCompanyId(company.id || '__new__');
    setEditingCompanyDraft({ ...company });
  };

  const startNewCompany = () => {
    const draft = buildEmptyCompany();
    setEditingCompanyId('__new__');
    setEditingCompanyDraft(draft);
  };

  const cancelEditCompany = () => {
    setEditingCompanyId(null);
    setEditingCompanyDraft(null);
  };

  const updateCompanyDraft = (field: keyof LaborCompany, value: string) => {
    if (!editingCompanyDraft) return;
    const normalized =
      field === 'businessRegistrationNumber' ? normalizeBusinessNumber(value) :
      field === 'companyPhone' ? normalizePhone(value) :
      field === 'workplaceManagementNumber' ? normalizeWorkplaceManagementNumber(value) :
      value;
    setEditingCompanyDraft((prev) => prev ? { ...prev, [field]: normalized } : prev);
  };

  const handleSaveCompany = async () => {
    if (!editingCompanyDraft) return;
    if (!editingCompanyDraft.companyName.trim()) {
      setNotice({ tone: 'error', message: '회사명을 입력해 주세요.' });
      return;
    }
    setCompanySaving(true);
    try {
      const toSave: LaborCompany = {
        ...editingCompanyDraft,
        id: editingCompanyDraft.id || crypto.randomUUID(),
      };
      const saved = await saveLaborCompany(toSave);
      setCompanies((prev) => {
        const exists = prev.some((c) => c.id === saved.id);
        return exists ? prev.map((c) => c.id === saved.id ? saved : c) : [...prev, saved];
      });
      if (selectedCompany?.id === saved.id) setSelectedCompany(saved);
      cancelEditCompany();
      setNotice({ tone: 'success', message: '회사정보를 저장했습니다.' });
    } catch (error) {
      console.error('LaborWorkbench saveCompany:', error);
      setNotice({ tone: 'error', message: '회사정보 저장에 실패했습니다.' });
    } finally {
      setCompanySaving(false);
    }
  };

  const handleArchiveCompany = async (id: string) => {
    if (!window.confirm('이 회사를 보관하시겠습니까?')) return;
    try {
      await archiveLaborCompany(id);
      setCompanies((prev) => prev.filter((c) => c.id !== id));
      if (selectedCompany?.id === id) {
        setSelectedCompany(null);
        setMeta((prev) => ({ ...prev, companyId: null }));
      }
      setNotice({ tone: 'success', message: '회사를 보관했습니다.' });
    } catch (error) {
      console.error('LaborWorkbench archiveCompany:', error);
      setNotice({ tone: 'error', message: '회사 보관에 실패했습니다.' });
    }
  };

  // Pool worker CRUD handlers
  const startEditPoolWorker = (worker: LaborPoolWorker) => {
    setEditingPoolWorkerId(worker.id || '__new__');
    setEditingPoolWorkerDraft({ ...worker });
  };

  const startNewPoolWorker = () => {
    setEditingPoolWorkerId('__new__');
    setEditingPoolWorkerDraft(buildEmptyPoolWorker());
  };

  const cancelEditPoolWorker = () => {
    setEditingPoolWorkerId(null);
    setEditingPoolWorkerDraft(null);
  };

  const updatePoolWorkerDraft = (field: keyof LaborPoolWorker, value: string) => {
    if (!editingPoolWorkerDraft) return;
    const numericFields: Array<keyof LaborPoolWorker> = ['defaultDailyWage'];
    const normalized =
      field === 'residentId' ? normalizeResidentId(value) :
      field === 'phone' ? normalizePhone(value) :
      numericFields.includes(field) ? value :
      value;
    setEditingPoolWorkerDraft((prev) =>
      prev
        ? {
            ...prev,
            [field]: numericFields.includes(field) ? Number(normalized || 0) : normalized,
          }
        : prev,
    );
  };

  const handleSavePoolWorker = async () => {
    if (!editingPoolWorkerDraft) return;
    if (!editingPoolWorkerDraft.name.trim()) {
      setNotice({ tone: 'error', message: '근로자 이름을 입력해 주세요.' });
      return;
    }
    setPoolWorkerSaving(true);
    try {
      const toSave: LaborPoolWorker = {
        ...editingPoolWorkerDraft,
        id: editingPoolWorkerDraft.id || crypto.randomUUID(),
        name: editingPoolWorkerDraft.name.trim(),
      };
      const saved = await saveLaborPoolWorker(toSave);
      setPoolWorkers((prev) => {
        const exists = prev.some((w) => w.id === saved.id);
        return exists ? prev.map((w) => w.id === saved.id ? saved : w) : [...prev, saved];
      });
      cancelEditPoolWorker();
      setNotice({ tone: 'success', message: '근로자풀에 저장했습니다.' });
    } catch (error) {
      console.error('LaborWorkbench savePoolWorker:', error);
      setNotice({ tone: 'error', message: '근로자풀 저장에 실패했습니다.' });
    } finally {
      setPoolWorkerSaving(false);
    }
  };

  const handleArchivePoolWorker = async (id: string) => {
    if (!window.confirm('이 근로자를 풀에서 보관하시겠습니까?')) return;
    try {
      await archiveLaborPoolWorker(id);
      setPoolWorkers((prev) => prev.filter((w) => w.id !== id));
      setNotice({ tone: 'success', message: '근로자를 보관했습니다.' });
    } catch (error) {
      console.error('LaborWorkbench archivePoolWorker:', error);
      setNotice({ tone: 'error', message: '근로자 보관에 실패했습니다.' });
    }
  };

  // Pool picker for project tab
  const handleConfirmPoolPicker = () => {
    const selected = poolWorkers.filter((pw) => poolPickerSelected.has(pw.id));
    if (selected.length === 0) return;
    const newWorkers = selected.map((pw) => buildWorkerFromPool(pw));
    setWorkers((prev) => [...prev.filter((w) => w.name.trim()), ...newWorkers]);
    setShowPoolPicker(false);
    setPoolPickerSelected(new Set());
    setNotice({ tone: 'success', message: `근로자 ${selected.length}명을 프로젝트에 추가했습니다.` });
  };

  const tabClass = (tab: LaborTab) => classNames(
    'cursor-pointer rounded-full px-4 py-2.5 text-sm font-medium transition-colors',
    activeTab === tab ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
  );

  const TAB_LABELS: Record<LaborTab, string> = {
    companies: '회사관리',
    pool: '근로자풀',
    project: '프로젝트설정',
    entries: '노무입력',
    ledger: '노무비대장',
    report: '신고서',
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">노무비 작업공간</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">입력은 쉽게, 계산 근거와 신고 준비 상태는 바로 확인할 수 있게 구성했습니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleCreateProject} className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">프로젝트 생성</button>
            <button onClick={handleArchiveProject} disabled={!selectedProject} className="cursor-pointer rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-900">프로젝트 보관</button>
            <button onClick={handleSave} disabled={saving || !selectedProject} className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">{saving ? '저장 중...' : 'Supabase 저장'}</button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr]">
          <LabeledSelect label="프로젝트" value={selectedProjectId ?? ''} onChange={(value) => setSelectedProjectId(value || null)} options={[{ value: '', label: '선택하세요' }, ...projects.map((project) => ({ value: project.id, label: `${project.name} (${project.workYear}.${String(project.workMonth).padStart(2, '0')})` }))]} />
          <LabeledInput label="프로젝트명" value={projectName} onChange={setProjectName} disabled={!selectedProject} />
        </div>

        {notice && <Notice tone={notice.tone} message={notice.message} />}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 px-3 py-3 dark:border-gray-700"><div className="text-xs text-gray-500 dark:text-gray-400">상태</div><div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{selectedProject ? '편집 가능' : '프로젝트 없음'}</div></div>
          <div className="rounded-xl border border-gray-200 px-3 py-3 dark:border-gray-700"><div className="text-xs text-gray-500 dark:text-gray-400">근로자</div><div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{validWorkers.length}명</div></div>
          <div className="rounded-xl border border-gray-200 px-3 py-3 dark:border-gray-700"><div className="text-xs text-gray-500 dark:text-gray-400">총 공수</div><div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{totals.totalUnits}</div></div>
          <div className="rounded-xl border border-gray-200 px-3 py-3 dark:border-gray-700"><div className="text-xs text-gray-500 dark:text-gray-400">차감지급 총액</div><div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{formatCurrency(totals.netPay)}원</div></div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto">
          {(['companies', 'pool', 'project', 'entries', 'ledger', 'report'] as LaborTab[]).map((tab) => (
            <button key={tab} className={tabClass(tab)} onClick={() => setActiveTab(tab)}>{TAB_LABELS[tab]}</button>
          ))}
        </div>
      </section>

      {loading && <section className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">노무비 프로젝트를 불러오는 중입니다.</section>}

      {/* 회사관리 탭 */}
      {!loading && activeTab === 'companies' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">회사관리</h3>
            <button
              onClick={startNewCompany}
              disabled={editingCompanyId === '__new__'}
              className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              회사 추가
            </button>
          </div>

          {/* New company form */}
          {editingCompanyId === '__new__' && editingCompanyDraft && (
            <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
              <div className="mb-3 text-sm font-semibold text-blue-900 dark:text-blue-100">새 회사 추가</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <LabeledInput label="회사명" value={editingCompanyDraft.companyName} onChange={(v) => updateCompanyDraft('companyName', v)} required />
                <LabeledInput label="대표자명" value={editingCompanyDraft.representativeName} onChange={(v) => updateCompanyDraft('representativeName', v)} />
                <LabeledInput label="사업자등록번호" value={editingCompanyDraft.businessRegistrationNumber} onChange={(v) => updateCompanyDraft('businessRegistrationNumber', v)} placeholder="000-00-00000" />
                <LabeledInput label="전화번호" value={editingCompanyDraft.companyPhone} onChange={(v) => updateCompanyDraft('companyPhone', v)} />
                <LabeledInput label="휴대전화" value={editingCompanyDraft.companyPhoneMobile} onChange={(v) => updateCompanyDraft('companyPhoneMobile', v)} />
                <LabeledInput label="팩스번호" value={editingCompanyDraft.companyFax} onChange={(v) => updateCompanyDraft('companyFax', v)} />
                <LabeledInput label="사업장관리번호" value={editingCompanyDraft.workplaceManagementNumber} onChange={(v) => updateCompanyDraft('workplaceManagementNumber', v)} />
                <div className="md:col-span-2 xl:col-span-2"><LabeledInput label="회사 주소" value={editingCompanyDraft.companyAddress} onChange={(v) => updateCompanyDraft('companyAddress', v)} /></div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={handleSaveCompany} disabled={companySaving} className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{companySaving ? '저장 중...' : '저장'}</button>
                <button onClick={cancelEditCompany} className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">취소</button>
              </div>
            </div>
          )}

          {companies.length === 0 && editingCompanyId !== '__new__' && (
            <Notice tone="info" message="등록된 회사가 없습니다. 회사 추가 버튼으로 새 회사를 등록하세요." />
          )}

          <div className="space-y-3">
            {companies.map((company) => (
              <div key={company.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                {editingCompanyId === company.id && editingCompanyDraft ? (
                  <div>
                    <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">회사 편집</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <LabeledInput label="회사명" value={editingCompanyDraft.companyName} onChange={(v) => updateCompanyDraft('companyName', v)} required />
                      <LabeledInput label="대표자명" value={editingCompanyDraft.representativeName} onChange={(v) => updateCompanyDraft('representativeName', v)} />
                      <LabeledInput label="사업자등록번호" value={editingCompanyDraft.businessRegistrationNumber} onChange={(v) => updateCompanyDraft('businessRegistrationNumber', v)} placeholder="000-00-00000" />
                      <LabeledInput label="전화번호" value={editingCompanyDraft.companyPhone} onChange={(v) => updateCompanyDraft('companyPhone', v)} />
                      <LabeledInput label="휴대전화" value={editingCompanyDraft.companyPhoneMobile} onChange={(v) => updateCompanyDraft('companyPhoneMobile', v)} />
                      <LabeledInput label="팩스번호" value={editingCompanyDraft.companyFax} onChange={(v) => updateCompanyDraft('companyFax', v)} />
                      <LabeledInput label="사업장관리번호" value={editingCompanyDraft.workplaceManagementNumber} onChange={(v) => updateCompanyDraft('workplaceManagementNumber', v)} />
                      <div className="md:col-span-2 xl:col-span-2"><LabeledInput label="회사 주소" value={editingCompanyDraft.companyAddress} onChange={(v) => updateCompanyDraft('companyAddress', v)} /></div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={handleSaveCompany} disabled={companySaving} className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{companySaving ? '저장 중...' : '저장'}</button>
                      <button onClick={cancelEditCompany} className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{company.companyName}</div>
                      <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {company.representativeName && <span className="mr-2">대표: {company.representativeName}</span>}
                        {company.businessRegistrationNumber && <span className="mr-2">{company.businessRegistrationNumber}</span>}
                      </div>
                      {company.companyAddress && <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{company.companyAddress}</div>}
                      {company.companyPhone && <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{company.companyPhone}</div>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => startEditCompany(company)} className="cursor-pointer text-sm text-blue-500">수정</button>
                      <button onClick={() => handleArchiveCompany(company.id)} className="cursor-pointer text-sm text-red-500">보관</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 근로자풀 탭 */}
      {!loading && activeTab === 'pool' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">근로자풀</h3>
            <button
              onClick={startNewPoolWorker}
              disabled={editingPoolWorkerId === '__new__'}
              className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              근로자 추가
            </button>
          </div>

          {/* New pool worker form */}
          {editingPoolWorkerId === '__new__' && editingPoolWorkerDraft && (
            <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
              <div className="mb-3 text-sm font-semibold text-blue-900 dark:text-blue-100">새 근로자 추가</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <LabeledInput label="이름" value={editingPoolWorkerDraft.name} onChange={(v) => updatePoolWorkerDraft('name', v)} required />
                <LabeledInput label="주민번호/외국인등록번호" value={editingPoolWorkerDraft.residentId} onChange={(v) => updatePoolWorkerDraft('residentId', v)} maxLength={14} placeholder="000000-0000000" />
                <LabeledInput label="연락처" value={editingPoolWorkerDraft.phone} onChange={(v) => updatePoolWorkerDraft('phone', v)} />
                <LabeledInput label="주소" value={editingPoolWorkerDraft.address} onChange={(v) => updatePoolWorkerDraft('address', v)} />
                <LabeledInput label="기본 일급" type="number" value={editingPoolWorkerDraft.defaultDailyWage} onChange={(v) => updatePoolWorkerDraft('defaultDailyWage', v)} />
                <LabeledInput label="직종" value={editingPoolWorkerDraft.jobType} onChange={(v) => updatePoolWorkerDraft('jobType', v)} />
                <LabeledInput label="팀명" value={editingPoolWorkerDraft.teamName} onChange={(v) => updatePoolWorkerDraft('teamName', v)} />
                <LabeledInput label="은행" value={editingPoolWorkerDraft.bankName} onChange={(v) => updatePoolWorkerDraft('bankName', v)} />
                <LabeledInput label="계좌번호" value={editingPoolWorkerDraft.accountNumber} onChange={(v) => updatePoolWorkerDraft('accountNumber', v)} />
                <LabeledInput label="예금주" value={editingPoolWorkerDraft.accountHolder} onChange={(v) => updatePoolWorkerDraft('accountHolder', v)} />
                <LabeledSelect label="고용기간" value={editingPoolWorkerDraft.employmentDurationType} onChange={(v) => updatePoolWorkerDraft('employmentDurationType', v)} options={DURATION_OPTIONS} />
                <LabeledSelect label="현장유형" value={editingPoolWorkerDraft.workplaceType} onChange={(v) => updatePoolWorkerDraft('workplaceType', v)} options={WORKPLACE_OPTIONS} />
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={handleSavePoolWorker} disabled={poolWorkerSaving} className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{poolWorkerSaving ? '저장 중...' : '저장'}</button>
                <button onClick={cancelEditPoolWorker} className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">취소</button>
              </div>
            </div>
          )}

          {poolWorkers.length === 0 && editingPoolWorkerId !== '__new__' && (
            <Notice tone="info" message="등록된 근로자가 없습니다. 근로자 추가 버튼으로 풀을 구성하세요." />
          )}

          <div className="space-y-3">
            {poolWorkers.map((pw) => (
              <div key={pw.id} className="rounded-2xl border border-gray-200 p-3 dark:border-gray-700">
                {editingPoolWorkerId === pw.id && editingPoolWorkerDraft ? (
                  <div>
                    <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">근로자 편집</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <LabeledInput label="이름" value={editingPoolWorkerDraft.name} onChange={(v) => updatePoolWorkerDraft('name', v)} required />
                      <LabeledInput label="주민번호/외국인등록번호" value={editingPoolWorkerDraft.residentId} onChange={(v) => updatePoolWorkerDraft('residentId', v)} maxLength={14} placeholder="000000-0000000" />
                      <LabeledInput label="연락처" value={editingPoolWorkerDraft.phone} onChange={(v) => updatePoolWorkerDraft('phone', v)} />
                      <LabeledInput label="주소" value={editingPoolWorkerDraft.address} onChange={(v) => updatePoolWorkerDraft('address', v)} />
                      <LabeledInput label="기본 일급" type="number" value={editingPoolWorkerDraft.defaultDailyWage} onChange={(v) => updatePoolWorkerDraft('defaultDailyWage', v)} />
                      <LabeledInput label="직종" value={editingPoolWorkerDraft.jobType} onChange={(v) => updatePoolWorkerDraft('jobType', v)} />
                      <LabeledInput label="팀명" value={editingPoolWorkerDraft.teamName} onChange={(v) => updatePoolWorkerDraft('teamName', v)} />
                      <LabeledInput label="은행" value={editingPoolWorkerDraft.bankName} onChange={(v) => updatePoolWorkerDraft('bankName', v)} />
                      <LabeledInput label="계좌번호" value={editingPoolWorkerDraft.accountNumber} onChange={(v) => updatePoolWorkerDraft('accountNumber', v)} />
                      <LabeledInput label="예금주" value={editingPoolWorkerDraft.accountHolder} onChange={(v) => updatePoolWorkerDraft('accountHolder', v)} />
                      <LabeledSelect label="고용기간" value={editingPoolWorkerDraft.employmentDurationType} onChange={(v) => updatePoolWorkerDraft('employmentDurationType', v)} options={DURATION_OPTIONS} />
                      <LabeledSelect label="현장유형" value={editingPoolWorkerDraft.workplaceType} onChange={(v) => updatePoolWorkerDraft('workplaceType', v)} options={WORKPLACE_OPTIONS} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={handleSavePoolWorker} disabled={poolWorkerSaving} className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{poolWorkerSaving ? '저장 중...' : '저장'}</button>
                      <button onClick={cancelEditPoolWorker} className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{pw.name}</div>
                      <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {pw.jobType || '직종 없음'} · {formatCurrency(pw.defaultDailyWage)}원/일
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => startEditPoolWorker(pw)} className="cursor-pointer text-sm text-blue-500">수정</button>
                      <button onClick={() => handleArchivePoolWorker(pw.id)} className="cursor-pointer text-sm text-red-500">보관</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 프로젝트설정 탭 */}
      {!loading && activeTab === 'project' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">프로젝트설정</h3>

          {/* Company selector */}
          <div className="mb-5">
            <div className="mb-1 text-sm text-gray-500 dark:text-gray-400">회사 선택 <span className="ml-1 text-red-500">*</span></div>
            <select
              value={meta.companyId ?? ''}
              onChange={(e) => {
                const id = e.target.value || null;
                setMeta((prev) => ({ ...prev, companyId: id }));
                setSelectedCompany(companies.find((c) => c.id === id) ?? null);
              }}
              disabled={!selectedProject}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 md:max-w-sm"
            >
              <option value="">회사를 선택하세요</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
            {selectedCompany && (
              <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                <div>{selectedCompany.representativeName && <span className="mr-3">대표: {selectedCompany.representativeName}</span>}{selectedCompany.businessRegistrationNumber && <span>{selectedCompany.businessRegistrationNumber}</span>}</div>
                {selectedCompany.companyPhone && <div className="mt-0.5 text-xs">{selectedCompany.companyPhone}</div>}
                {selectedCompany.companyAddress && <div className="mt-0.5 text-xs">{selectedCompany.companyAddress}</div>}
              </div>
            )}
          </div>

          {/* Project-specific fields */}
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <LabeledInput label="현장명" value={meta.siteName} onChange={(value) => setMetaField('siteName', value)} disabled={!selectedProject} required />
            <LabeledInput label="현장책임자" value={meta.managerName} onChange={(value) => setMetaField('managerName', value)} disabled={!selectedProject} required />
            <LabeledInput label="책임자 주민번호" value={meta.managerResidentId} onChange={(value) => setMetaField('managerResidentId', value)} disabled={!selectedProject} />
            <LabeledInput label="직위" value={meta.managerTitle} onChange={(value) => setMetaField('managerTitle', value)} disabled={!selectedProject} />
            <LabeledInput label="직무내용" value={meta.managerJobDescription} onChange={(value) => setMetaField('managerJobDescription', value)} disabled={!selectedProject} />
            <LabeledInput label="작업연도" type="number" value={meta.workYear} onChange={(value) => setMetaField('workYear', value)} disabled={!selectedProject} />
            <LabeledInput label="작업월" type="number" value={meta.workMonth} onChange={(value) => setMetaField('workMonth', value)} disabled={!selectedProject} />
            <LabeledInput label="지급일" type="date" value={meta.paymentDate} onChange={(value) => setMetaField('paymentDate', value)} disabled={!selectedProject} required />
          </div>

          {/* Worker assignment */}
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">프로젝트 근로자</h4>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPoolPicker(true); setPoolPickerSelected(new Set()); }}
                disabled={!selectedProject || poolWorkers.length === 0}
                className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
              >
                풀에서 추가
              </button>
              <button onClick={addWorker} disabled={!selectedProject} className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">+ 근로자 추가</button>
            </div>
          </div>

          {/* Pool picker inline */}
          {showPoolPicker && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
              <div className="mb-3 text-sm font-medium text-blue-900 dark:text-blue-100">근로자풀에서 선택</div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">{poolPickerSelected.size}명 선택</span>
                <button
                  onClick={() => setPoolPickerSelected((prev) => prev.size === poolWorkers.length ? new Set() : new Set(poolWorkers.map((pw) => pw.id)))}
                  className="cursor-pointer text-xs text-blue-600 dark:text-blue-400"
                >
                  {poolPickerSelected.size === poolWorkers.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
              <div className="mb-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-blue-100 bg-white p-2 dark:border-blue-900 dark:bg-gray-900">
                {poolWorkers.map((pw) => (
                  <label key={pw.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-950/30">
                    <input
                      type="checkbox"
                      checked={poolPickerSelected.has(pw.id)}
                      onChange={() => setPoolPickerSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(pw.id)) next.delete(pw.id); else next.add(pw.id);
                        return next;
                      })}
                      className="rounded"
                    />
                    <span className="text-gray-900 dark:text-gray-100">{pw.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{pw.jobType || '-'}, {formatCurrency(pw.defaultDailyWage)}원</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleConfirmPoolPicker} disabled={poolPickerSelected.size === 0} className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">추가 ({poolPickerSelected.size}명)</button>
                <button onClick={() => { setShowPoolPicker(false); setPoolPickerSelected(new Set()); }} className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">취소</button>
              </div>
            </div>
          )}

          {/* Worker cards */}
          <div className="space-y-3">
            {workers.map((worker, index) => (
              <div key={worker.id} className="rounded-2xl border border-gray-200 p-3 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    근로자 {index + 1} ({worker.name || '미입력'})
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setExpandedWorkerId(expandedWorkerId === worker.id ? null : worker.id)} className="cursor-pointer text-sm text-blue-500">
                      {expandedWorkerId === worker.id ? '접기' : '수정'}
                    </button>
                    <button onClick={() => removeWorker(worker.id)} disabled={!selectedProject} className="cursor-pointer text-sm text-red-500 disabled:cursor-not-allowed disabled:opacity-50">삭제</button>
                  </div>
                </div>
                {expandedWorkerId === worker.id && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <LabeledInput label="이름" value={worker.name} onChange={(value) => updateWorker(worker.id, 'name', value)} disabled={!selectedProject} required />
                    <LabeledInput label="주민번호/외국인등록번호" value={worker.residentId} onChange={(value) => updateWorker(worker.id, 'residentId', value)} disabled={!selectedProject} required maxLength={14} placeholder="000000-0000000" />
                    <LabeledInput label="연락처" value={worker.phone} onChange={(value) => updateWorker(worker.id, 'phone', value)} disabled={!selectedProject} required />
                    <LabeledInput label="주소" value={worker.address} onChange={(value) => updateWorker(worker.id, 'address', value)} disabled={!selectedProject} required />
                    <LabeledInput label="일급" type="number" value={worker.dailyWage} onChange={(value) => updateWorker(worker.id, 'dailyWage', value)} disabled={!selectedProject} required />
                    <LabeledSelect label="고용기간" value={worker.employmentDurationType} onChange={(value) => updateWorker(worker.id, 'employmentDurationType', value)} disabled={!selectedProject} options={DURATION_OPTIONS} />
                    <LabeledSelect label="현장유형" value={worker.workplaceType} onChange={(value) => updateWorker(worker.id, 'workplaceType', value)} disabled={!selectedProject} options={WORKPLACE_OPTIONS} />
                    <LabeledInput label="월 근로시간" type="number" value={worker.monthlyHours} onChange={(value) => updateWorker(worker.id, 'monthlyHours', value)} disabled={!selectedProject} />
                    <LabeledInput label="직종" value={worker.jobType} onChange={(value) => updateWorker(worker.id, 'jobType', value)} disabled={!selectedProject} required />
                    <LabeledInput label="팀명" value={worker.teamName} onChange={(value) => updateWorker(worker.id, 'teamName', value)} disabled={!selectedProject} />
                    <LabeledInput label="은행" value={worker.bankName} onChange={(value) => updateWorker(worker.id, 'bankName', value)} disabled={!selectedProject} />
                    <LabeledInput label="계좌번호" value={worker.accountNumber} onChange={(value) => updateWorker(worker.id, 'accountNumber', value)} disabled={!selectedProject} />
                    <LabeledInput label="예금주" value={worker.accountHolder} onChange={(value) => updateWorker(worker.id, 'accountHolder', value)} disabled={!selectedProject} />
                    <LabeledSelect label="계산유형" value={worker.calculationType} onChange={(value) => updateWorker(worker.id, 'calculationType', value)} disabled={!selectedProject} options={CALCULATION_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} />
                    <LabeledInput label="수동 국민연금" type="number" value={worker.manualNationalPension} onChange={(value) => updateWorker(worker.id, 'manualNationalPension', value)} disabled={!selectedProject} />
                    <LabeledInput label="수동 건강보험" type="number" value={worker.manualHealthInsurance} onChange={(value) => updateWorker(worker.id, 'manualHealthInsurance', value)} disabled={!selectedProject} />
                    <LabeledInput label="수동 장기요양" type="number" value={worker.manualLongTermCare} onChange={(value) => updateWorker(worker.id, 'manualLongTermCare', value)} disabled={!selectedProject} />
                    <LabeledInput label="기타 수동공제" type="number" value={worker.manualOtherDeduction} onChange={(value) => updateWorker(worker.id, 'manualOtherDeduction', value)} disabled={!selectedProject} />
                    <div className="col-span-full space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <div>{CALCULATION_TYPE_OPTIONS.find((option) => option.value === worker.calculationType)?.desc}</div>
                      <div>국민연금 자동 판정: 1개월 이상 근로 + 월 8일 이상 또는 일반사업장 60시간 이상</div>
                      <div>건강보험/장기요양 자동 판정: 1개월 이상 근로</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 노무입력 탭 */}
      {!loading && activeTab === 'entries' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">달력형 노무입력</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">날짜를 누르면 1공수로 체크되고, 선택한 날짜는 아래에서 0.5, 1, 1.5, 2공수로 조정할 수 있습니다.</p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{meta.workYear}.{String(meta.workMonth).padStart(2, '0')}</div>
          </div>
          <div className="space-y-4">
            {workers.map((worker) => {
              const row = ledgerRows.find((item) => item.worker.id === worker.id);
              return (
                <div key={worker.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                  <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div><div className="font-medium text-gray-900 dark:text-gray-100">{worker.name || '이름 미입력'}</div><div className="text-xs text-gray-500 dark:text-gray-400">{worker.jobType || '직종 미입력'} · 총 공수 {row?.totalUnits ?? 0}</div></div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => fillWeekdays(worker.id)} disabled={!selectedProject} className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200">평일 전체 1공수</button>
                      <button onClick={() => clearWorkerDays(worker.id)} disabled={!selectedProject} className="cursor-pointer rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50">전체 해제</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="grid w-max grid-cols-7 gap-1">
                      {days.map((day) => {
                        const units = getLaborEntryUnits(entries, worker.id, day);
                        const weekday = new Date(meta.workYear, meta.workMonth - 1, day).getDay();
                        const isWeekend = weekday === 0 || weekday === 6;
                        const isSelected = selectedEntryCell?.workerId === worker.id && selectedEntryCell.day === day;
                        const toneClass = units >= 1.5 ? 'border-blue-600 bg-blue-600 text-white' : units >= 1 ? 'border-blue-300 bg-blue-100 text-blue-900' : units > 0 ? 'border-sky-200 bg-sky-50 text-sky-800' : isWeekend ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-200 bg-white text-gray-700';
                        return (
                          <button key={day} type="button" disabled={!selectedProject} onClick={() => toggleDay(worker.id, day)} className={classNames('h-9 w-10 rounded-lg border px-1 py-1 text-left transition disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700', toneClass, isSelected && 'ring-2 ring-blue-400')}>
                            <div className="text-xs font-semibold">{day}</div>
                            <div className="mt-0.5 text-[9px] leading-none">{units > 0 ? `${units}` : '-'}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedEntryCell && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
              <div className="mb-2 text-xs font-medium text-blue-900 dark:text-blue-100">선택한 날짜 공수 설정: {workers.find((worker) => worker.id === selectedEntryCell.workerId)?.name || '-'} / {selectedEntryCell.day}일</div>
              <div className="flex flex-wrap gap-2">
                {[0.5, 1, 1.5, 2].map((units) => <button key={units} type="button" onClick={() => applyUnits(selectedEntryCell.workerId, selectedEntryCell.day, units)} className="cursor-pointer rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700">{units}공수</button>)}
                <button type="button" onClick={() => applyUnits(selectedEntryCell.workerId, selectedEntryCell.day, 0)} className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white">해제</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 노무비대장 탭 */}
      {!loading && activeTab === 'ledger' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">노무비대장</h3>
              <div className="text-sm text-gray-500 dark:text-gray-400">원본 A4 양식 미리보기</div>
            </div>
            <button onClick={handlePrintLedger} className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">노무비대장 인쇄</button>
          </div>
          <LaborLedgerDocument meta={resolvedMeta as unknown as Parameters<typeof LaborLedgerDocument>[0]['meta']} ledgerRows={ledgerRows} totals={totals} entries={entries} />
        </section>
      )}

      {showCalibrator && (
        <div className="fixed inset-0 z-50 bg-gray-900">
          <button
            onClick={() => setShowCalibrator(false)}
            className="absolute right-4 top-2 z-50 rounded bg-red-600 px-3 py-1 text-sm text-white"
          >
            닫기
          </button>
          <LaborCalibrator />
        </div>
      )}

      {/* 신고서 탭 */}
      {!loading && activeTab === 'report' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">근로내용확인신고서</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">현행 PDF 양식 미리보기</p>
              <button
                className="mt-1 text-xs text-gray-400 underline"
                onClick={() => setShowCalibrator(true)}
              >
                [좌표 캘리브레이터]
              </button>
            </div>
            <button
              onClick={handlePrintReport}
              disabled={!reportReady || reportPdfLoading}
              className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              신고서 인쇄
            </button>
          </div>
          {!reportReady && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              신고서 생성 전 입력 필요: {reportMissingFields.join(', ')}
            </div>
          )}
          {reportPdfLoading ? (
            <div className="flex min-h-[70vh] items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              현행 PDF 양식 미리보기를 생성하는 중입니다.
            </div>
          ) : reportPdfUrl ? (
            <iframe
              title="근로내용확인신고서 PDF 미리보기"
              src={reportPdfUrl}
              className="h-[90vh] w-full rounded-2xl border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <div className="flex min-h-[70vh] items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              신고서 PDF 미리보기를 생성하지 못했습니다.
            </div>
          )}
        </section>
      )}

      <LaborPrintSheets printMode={printMode} meta={resolvedMeta as unknown as Parameters<typeof LaborPrintSheets>[0]['meta']} ledgerRows={ledgerRows} totals={totals} reportRows={reportRows} entries={entries} />
    </div>
  );
}
