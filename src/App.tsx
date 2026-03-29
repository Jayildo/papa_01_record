import { useState, useEffect, useCallback, useRef, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import type { Project, TreeRecord, SyncStatus } from './types';
import { supabase } from './lib/supabase';
import { syncPendingRecords, flushOfflineQueue, hashRecord } from './utils/syncEngine';
import { persistRecordsImmediate, persistProjectsImmediate, loadLocalProjects, loadDeletedIds, persistDeletedIds, clearDeletedIds } from './utils/offlineStore';
import { backupToGoogleSheets } from './utils/sheetsBackup';
import InputTab from './components/InputTab';
import ResultTab from './components/ResultTab';
import PinScreen, { isAuthed } from './components/PinScreen';
import SyncIndicator from './components/SyncIndicator';
import HistoryPanel from './components/HistoryPanel';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">오류가 발생했습니다</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 text-center">{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload(); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer active:bg-blue-700"
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DARK_KEY = 'papa_01_dark';

function loadDark(): boolean {
  const saved = localStorage.getItem(DARK_KEY);
  if (saved !== null) return saved === 'true';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

type Tab = 'input' | 'result';

function AppContent() {
  const [authed, setAuthed] = useState(isAuthed);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('input');
  const [newName, setNewName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const [dark, setDark] = useState(loadDark);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [syncError, setSyncError] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [monthFilter, setMonthFilter] = useState<string | null>(null); // null = 전체, 'YY.MM' = 해당 월
  // projects ref (doSync 등 콜백에서 최신 projects 참조용)
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  // deletedIds ref (삭제 대기 ID — sync 시 soft delete 전송)
  const deletedIdsRef = useRef<number[]>([]);

  // isDirty는 _syncState에서 파생 (selected보다 먼저 사용되므로 projects에서 직접 계산)
  const isDirty = selectedId
    ? projects.find(p => p.id === selectedId)?.records.some(r => r._syncState !== 'synced') ?? false
    : false;

  // 다크모드
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(DARK_KEY, String(dark));
  }, [dark]);

  // 미저장 변경사항 브라우저 닫기/새로고침 경고
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 브라우저 뒤로가기 버튼 처리 (History API)
  useEffect(() => {
    if (selectedId) {
      window.history.pushState({ projectId: selectedId }, '');
    }
  }, [selectedId]);

  useEffect(() => {
    const handler = (_e: PopStateEvent) => {
      if (selectedId) {
        if (isDirty && !confirm('저장되지 않은 변경사항이 있습니다.\n정말 나가시겠습니까?')) {
          window.history.pushState({ projectId: selectedId }, '');
          return;
        }
        setSelectedId(null);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [selectedId, isDirty]);

  // 프로젝트 목록 로드 (로컬 퍼스트: IndexedDB → Supabase 백그라운드 동기화)
  const loadProjects = useCallback(async () => {
    // 1단계: 로컬 데이터 먼저 표시 (즉시)
    const localProjects = await loadLocalProjects();
    if (localProjects && localProjects.length > 0) {
      // 구버전 캐시 호환: _syncState 없는 레코드에 기본값 부여
      const migrated = localProjects.map(p => ({
        ...p,
        records: p.records.map(r => ({
          ...r,
          _syncState: r._syncState ?? ('synced' as const),
        })),
      }));
      setProjects(migrated);
      setLoading(false);
    }

    // 2단계: Supabase에서 최신 데이터 동기화
    const { data: projectRows, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true });

    if (projectsError) {
      console.error('loadProjects:', projectsError);
      setLoadError('서버 연결 실패. 로컬 데이터를 표시합니다.');
      if (!localProjects || localProjects.length === 0) {
        setLoading(false);
      }
      return;
    }
    if (!projectRows) { setLoading(false); return; }

    setLoadError('');

    // 프로젝트별로 레코드 fetch (range 잘림 방지)
    const recordsByProject = new Map<string, TreeRecord[]>();
    for (const proj of projectRows) {
      const { data: rows, error: recErr } = await supabase
        .from('tree_records')
        .select('*')
        .eq('project_id', proj.id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      if (recErr) {
        console.error(`loadProjects records for ${proj.id}:`, recErr);
        continue;
      }
      if (rows && rows.length > 0) {
        recordsByProject.set(
          proj.id,
          rows.map((r) => ({
            id: r.id,
            diameter: Number(r.diameter),
            species: r.species as TreeRecord['species'],
            location: r.location,
            note: r.note ?? '',
            _syncState: 'synced' as const,
          })),
        );
      }
    }

    const serverProjects = projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      records: recordsByProject.get(p.id) ?? [],
      createdAt: p.created_at,
      sealed: p.sealed ?? false,
    }));

    // 빈 서버 응답으로 기존 로컬 데이터 삭제 방지
    if (serverProjects.length === 0 && localProjects && localProjects.length > 0) {
      console.warn('loadProjects: server returned empty but local has data — keeping local');
      setLoading(false);
      return;
    }

    // 편집 중인 프로젝트는 로컬 데이터 보호, 나머지는 서버 데이터로 갱신
    const currentProjects = projectsRef.current;
    const localEditIds = new Set(
      currentProjects
        .filter(p => p.records.some(r => r._syncState !== 'synced'))
        .map(p => p.id),
    );

    const merged = serverProjects.map(sp => {
      if (localEditIds.has(sp.id)) {
        // 편집 중인 프로젝트는 로컬 데이터 유지
        const local = currentProjects.find(p => p.id === sp.id);
        return local ?? sp;
      }
      return sp;
    });

    setProjects(merged);
    setLoading(false);

    // 서버 데이터를 로컬에 저장 (다음 로드 시 즉시 사용)
    persistProjectsImmediate(serverProjects);
  }, []);

  useEffect(() => {
    if (authed) loadProjects();
  }, [authed, loadProjects]);

  // 프로젝트 변경 시 로컬에 저장 (앱 시작 시 즉시 로드용)
  useEffect(() => {
    if (projects.length > 0) {
      persistProjectsImmediate(projects);
    }
  }, [projects]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  // 프로젝트 선택 시 deletedIds 로드
  useEffect(() => {
    if (selectedId) {
      loadDeletedIds(selectedId).then(ids => {
        deletedIdsRef.current = ids;
      });
    }
  }, [selectedId]);

  // 레코드 업데이트 (단순화: 로컬 state + IndexedDB 즉시 저장만)
  const setRecords = useCallback(
    (updater: TreeRecord[] | ((prev: TreeRecord[]) => TreeRecord[])) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedId) return p;
          const oldRecords = p.records;
          const newRecords = typeof updater === 'function' ? updater(oldRecords) : updater;

          // 삭제 감지: old에는 있고 new에는 없는 서버 레코드 → deletedIds에 추가
          const newIds = new Set(newRecords.map(r => r.id));
          for (const r of oldRecords) {
            if (!newIds.has(r.id) && r.id > 0) {
              if (!deletedIdsRef.current.includes(r.id)) {
                deletedIdsRef.current.push(r.id);
                persistDeletedIds(selectedId!, deletedIdsRef.current);
              }
            }
          }

          // 매 입력마다 즉시 IndexedDB에 저장
          if (selectedId) {
            persistRecordsImmediate(selectedId, newRecords);
          }

          return { ...p, records: newRecords };
        }),
      );
    },
    [selectedId],
  );

  // 레코드 DB 동기화 (_syncState 기반)
  const doSync = useCallback(
    async (records: TreeRecord[], projectId: string) => {
      // sync 대상 레코드의 hash 캡처 (sync 중 변경 감지용)
      const pendingRecords = records.filter(r => r._syncState === 'pending');
      if (pendingRecords.length === 0 && deletedIdsRef.current.length === 0) return;

      const preHash = new Map(pendingRecords.map(r => [r.id, hashRecord(r)]));

      setSyncStatus('syncing');
      setSyncError('');

      const result = await syncPendingRecords(records, projectId, deletedIdsRef.current);
      setSyncStatus(result.status);
      if (result.error) setSyncError(result.error);

      if (result.status === 'synced' || result.idMappings.size > 0) {
        // 삭제 완료 → deletedIds 정리
        if (result.status === 'synced' && deletedIdsRef.current.length > 0) {
          deletedIdsRef.current = [];
          clearDeletedIds(projectId);
        }

        // atomic 상태 전환: ID mapping + synced 마킹
        setProjects(prev =>
          prev.map(p => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              records: p.records.map(r => {
                const realId = result.idMappings.get(r.id);
                const wasSyncing = preHash.has(r.id);
                const unchanged = wasSyncing && hashRecord(r) === preHash.get(r.id);

                return {
                  ...r,
                  id: realId ?? r.id,
                  _syncState: unchanged ? 'synced' as const : r._syncState,
                };
              }),
            };
          }),
        );

        // Google Sheets 백업
        const proj = projectsRef.current.find(p => p.id === projectId);
        if (proj) {
          backupToGoogleSheets(proj.records, proj.name);
        }
      }
    },
    [],
  );

  const handleHistoryRestore = useCallback(
    (restoredRecords: TreeRecord[]) => {
      if (!selectedId) return;
      // 복원된 레코드를 모두 pending으로 마킹
      const markedRecords = restoredRecords.map(r => ({
        ...r,
        _syncState: 'pending' as const,
      }));
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedId ? { ...p, records: markedRecords } : p,
        ),
      );
      if (selectedId) {
        persistRecordsImmediate(selectedId, markedRecords);
      }
    },
    [selectedId],
  );

  // 수동 저장
  const handleSave = useCallback(() => {
    if (!selected || !isDirty) return;
    doSync(selected.records, selected.id);
  }, [selected, isDirty, doSync]);

  // 자동 저장 (2초 디바운스) — pending 레코드가 있을 때만
  const hasPendingRecords = selected?.records.some(r => r._syncState === 'pending') ?? false;
  useEffect(() => {
    if (!hasPendingRecords && deletedIdsRef.current.length === 0) return;
    if (!selectedId) return;
    const timer = setTimeout(() => {
      const proj = projectsRef.current.find(p => p.id === selectedId);
      if (proj) {
        doSync(proj.records, proj.id);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [hasPendingRecords, selectedId, doSync]);

  // 모바일: 앱 전환/화면 잠금 시 즉시 로컬 저장
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && selectedId) {
        const proj = projectsRef.current.find(p => p.id === selectedId);
        if (proj) {
          persistRecordsImmediate(selectedId, proj.records);
        }
      }
    };
    const handlePageHide = () => {
      if (selectedId) {
        const proj = projectsRef.current.find(p => p.id === selectedId);
        if (proj) {
          persistRecordsImmediate(selectedId, proj.records);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [selectedId]);

  // 온라인/오프라인 감지
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus('synced');
      flushOfflineQueue();
    };
    const handleOffline = () => setSyncStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) setSyncStatus('offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const createProject = async () => {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from('projects')
      .insert({ name })
      .select()
      .single();
    if (error) console.error('createProject:', error);
    if (data) {
      const project: Project = {
        id: data.id,
        name: data.name,
        records: [],
        createdAt: data.created_at,
      };
      setProjects((prev) => [...prev, project]);
      setSelectedId(project.id);
      setNewName('');
      setShowNewInput(false);
      setActiveTab('input');
    }
  };

  const toggleSealProject = async (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const newSealed = !target.sealed;
    const action = newSealed ? '확정' : '확정 해제';
    if (!confirm(`"${target.name}" 프로젝트를 ${action}하시겠습니까?\n${newSealed ? '확정 후에는 데이터를 수정할 수 없습니다.' : '데이터 수정이 가능해집니다.'}`))
      return;
    const { error } = await supabase
      .from('projects')
      .update({ sealed: newSealed })
      .eq('id', id);
    if (error) {
      console.error('toggleSealProject:', error);
      alert(`${action} 실패: ${error.message}`);
      return;
    }
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, sealed: newSealed } : p)),
    );
  };

  const renameProject = async (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const newName = prompt('새 프로젝트명을 입력하세요.', target.name);
    if (!newName || newName.trim() === '' || newName === target.name) return;
    const { error } = await supabase
      .from('projects')
      .update({ name: newName.trim() })
      .eq('id', id);
    if (error) {
      console.error('renameProject:', error);
      alert('이름 변경 실패: ' + error.message);
      return;
    }
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: newName.trim() } : p)),
    );
  };

  const deleteProject = async (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const input = prompt(`"${target.name}" 프로젝트를 삭제하려면\n프로젝트명을 정확히 입력하세요. (데이터 ${target.records.length}건 삭제)`);
    if (input !== target.name) {
      if (input !== null) alert('프로젝트명이 일치하지 않습니다.');
      return;
    }
    // Soft delete tree_records first to avoid CASCADE/trigger conflicts
    const { error: recError } = await supabase
      .from('tree_records')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', id)
      .is('deleted_at', null);
    if (recError) console.error('deleteProject records:', recError);
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) console.error('deleteProject:', error);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // PIN 화면
  if (!authed) {
    return <PinScreen onSuccess={() => setAuthed(true)} />;
  }

  const clearCache = async () => {
    if (!confirm('로컬 캐시를 초기화하고 서버 데이터로 새로고침합니다.\n계속하시겠습니까?')) return;
    try {
      // IndexedDB 삭제
      const dbs = await indexedDB.databases?.() ?? [];
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
      // localStorage 정리
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('papa_') || k.startsWith('papa_01'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      // Service Worker 캐시 삭제
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      // SW unregister & reload
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      window.location.reload();
    } catch (e) {
      console.error('clearCache:', e);
      window.location.reload();
    }
  };

  const darkToggle = (
    <button
      onClick={() => setDark((d) => !d)}
      className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer
        text-gray-500 hover:bg-gray-100 active:bg-gray-200
        dark:text-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600
        transition-colors text-lg shrink-0"
      title={dark ? '라이트 모드' : '다크 모드'}
      aria-label={dark ? '라이트 모드' : '다크 모드'}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );

  // 로딩
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-400 dark:text-gray-500">로딩 중...</p>
      </div>
    );
  }

  // 서버 연결 실패 배너
  const loadErrorBanner = loadError ? (
    <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg px-3 py-2 mb-3 text-sm text-yellow-700 dark:text-yellow-300">
      {loadError}
    </div>
  ) : null;

  // 프로젝트 목록 화면
  if (!selected) {
    // 월별 필터용: 프로젝트 생성일에서 고유 월 추출 (최신순)
    const monthKeys = Array.from(
      new Set(
        projects.map((p) => {
          const d = new Date(p.createdAt);
          const yy = String(d.getFullYear()).slice(2);
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          return `${yy}.${mm}`;
        }),
      ),
    ).sort((a, b) => b.localeCompare(a)); // 최신 월이 앞

    // 필터링 + 최신순 정렬
    const filteredProjects = (monthFilter
      ? projects.filter((p) => {
          const d = new Date(p.createdAt);
          const yy = String(d.getFullYear()).slice(2);
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          return `${yy}.${mm}` === monthFilter;
        })
      : projects
    ).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="max-w-lg mx-auto p-4">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">수목 전정 현황</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={clearCache}
                className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer
                  text-gray-400 hover:bg-gray-100 active:bg-gray-200
                  dark:hover:bg-gray-700 dark:active:bg-gray-600
                  transition-colors text-sm shrink-0"
                title="캐시 초기화"
                aria-label="캐시 초기화"
              >
                ↻
              </button>
              {darkToggle}
            </div>
          </div>

          {loadErrorBanner}

          {/* 월별 필터 버튼 */}
          {monthKeys.length > 0 && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => setMonthFilter(null)}
                className={`px-4 py-2 rounded-full text-sm font-semibold shrink-0 cursor-pointer transition-colors ${
                  monthFilter === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 active:bg-gray-100 dark:active:bg-gray-700'
                }`}
              >
                전체
              </button>
              {monthKeys.map((mk) => (
                <button
                  key={mk}
                  onClick={() => setMonthFilter(mk)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold shrink-0 cursor-pointer transition-colors ${
                    monthFilter === mk
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 active:bg-gray-100 dark:active:bg-gray-700'
                  }`}
                >
                  {mk}
                </button>
              ))}
            </div>
          )}

          {/* 프로젝트 카드 목록 */}
          <div className="flex flex-col gap-2.5 mb-6">
            {filteredProjects.length === 0 && !showNewInput && (
              <p className="text-gray-400 dark:text-gray-500 py-12 text-center">
                {monthFilter ? `${monthFilter}에 생성된 프로젝트가 없습니다.` : '프로젝트가 없습니다.'}<br />새로 만들어주세요.
              </p>
            )}
            {filteredProjects.map((p) => {
              const validCount = p.records.filter(
                (r) => r.diameter > 0 && r.location.trim() && r.species !== '',
              ).length;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl p-4 cursor-pointer
                    bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                  onClick={() => {
                    setSelectedId(p.id);
                    setActiveTab('input');
                  }}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate text-gray-900 dark:text-gray-100">
                      {p.sealed && <span className="text-green-600 dark:text-green-400 mr-1">✓</span>}
                      {p.name}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      <span className="text-blue-500 dark:text-blue-400 font-medium">{validCount}건</span>
                      {p.sealed && <span className="text-green-600 dark:text-green-400 ml-1">확정</span>}
                      {' '}&middot; {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center shrink-0 -mr-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSealProject(p.id);
                      }}
                      className={`cursor-pointer text-sm px-2 py-2 ${
                        p.sealed
                          ? 'text-green-600 hover:text-green-700 active:text-green-800'
                          : 'text-gray-400 hover:text-green-500 active:text-green-600'
                      }`}
                    >
                      {p.sealed ? '해제' : '확정'}
                    </button>
                    {!p.sealed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          renameProject(p.id);
                        }}
                        className="text-gray-400 hover:text-blue-500 active:text-blue-600 cursor-pointer
                          text-sm px-2 py-2"
                      >
                        수정
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(p.id);
                      }}
                      className="text-red-400 hover:text-red-500 active:text-red-600 cursor-pointer
                        text-sm px-2 py-2"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {showNewInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createProject()}
                placeholder="프로젝트 이름"
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-base
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
                autoFocus
              />
              <button
                onClick={createProject}
                className="bg-blue-600 text-white px-5 py-3 rounded-xl font-medium cursor-pointer shrink-0
                  active:bg-blue-700"
              >
                생성
              </button>
              <button
                onClick={() => { setShowNewInput(false); setNewName(''); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer px-2"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewInput(true)}
              className="w-full bg-blue-600 text-white py-4 rounded-xl text-base font-medium
                cursor-pointer active:bg-blue-700"
            >
              + 새 프로젝트
            </button>
          )}
        </div>
      </div>
    );
  }

  // 프로젝트 선택된 상태
  const validCount = selected.records.filter(
    (r) => r.diameter > 0 && r.location.trim() && r.species !== '',
  ).length;

  const tabClass = (tab: Tab) =>
    `flex-1 sm:flex-none px-6 py-3 font-medium cursor-pointer transition-colors text-center ${
      activeTab === tab
        ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
        : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
    }`;

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              if (isDirty && !confirm('저장되지 않은 변경사항이 있습니다.\n정말 나가시겠습니까?')) return;
              setSelectedId(null);
            }}
            className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer
              text-gray-400 hover:bg-gray-100 active:bg-gray-200
              dark:hover:bg-gray-700 dark:active:bg-gray-600
              transition-colors text-lg shrink-0"
            title="프로젝트 목록"
            aria-label="프로젝트 목록으로 돌아가기"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate text-gray-900 dark:text-gray-100">
              {selected.name}
            </h1>
            <SyncIndicator status={syncStatus} errorMsg={syncError} onRetry={handleSave} />
          </div>
          <button
            onClick={() => setShowHistory(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer
              text-gray-500 hover:bg-gray-100 active:bg-gray-200
              dark:text-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600
              transition-colors text-lg shrink-0"
            title="변경 이력"
            aria-label="변경 이력"
          >
            🗂
          </button>
          {darkToggle}
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4" role="tablist">
          <button className={tabClass('input')} onClick={() => setActiveTab('input')} role="tab" aria-selected={activeTab === 'input'}>
            입력
          </button>
          <button className={tabClass('result')} onClick={() => setActiveTab('result')} role="tab" aria-selected={activeTab === 'result'}>
            결과 ({validCount}건)
          </button>
        </div>

        {activeTab === 'input' ? (
          <InputTab records={selected.records} setRecords={setRecords} projectName={selected.name} disabled={showHistory} onSave={selected.sealed ? undefined : handleSave} isDirty={isDirty} syncStatus={syncStatus} sealed={!!selected.sealed} />
        ) : (
          <ResultTab records={selected.records} projectName={selected.name} />
        )}
      </div>

      {showHistory && selected && (
        <HistoryPanel
          projectId={selected.id}
          onRestore={handleHistoryRestore}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
