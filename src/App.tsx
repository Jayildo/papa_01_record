import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, TreeRecord, SyncStatus } from './types';
import { supabase } from './lib/supabase';
import { syncChanges, syncRecords, flushOfflineQueue } from './utils/syncEngine';
import type { PendingChanges } from './utils/syncEngine';
import InputTab from './components/InputTab';
import ResultTab from './components/ResultTab';
import PinScreen, { isAuthed } from './components/PinScreen';
import SyncIndicator from './components/SyncIndicator';
import HistoryPanel from './components/HistoryPanel';

const DARK_KEY = 'papa_01_dark';

function loadDark(): boolean {
  const saved = localStorage.getItem(DARK_KEY);
  if (saved !== null) return saved === 'true';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

type Tab = 'input' | 'result';

export default function App() {
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
  // dirty 플래그: 사용자가 실제로 데이터를 수정했을 때만 true
  const dirtyRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  // 변경 추적: 실제 변경된 레코드만 sync
  const pendingRef = useRef<PendingChanges>({
    updates: new Map(),
    inserts: [],
    deletes: [],
    allRecords: [],
  });

  // 다크모드
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(DARK_KEY, String(dark));
  }, [dark]);

  // 프로젝트 목록 로드
  const loadProjects = useCallback(async () => {
    const { data: projectRows, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true });

    if (projectsError) console.error('loadProjects:', projectsError);
    if (!projectRows) { setLoading(false); return; }

    const { data: recordRows, error: recordsError } = await supabase
      .from('tree_records')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .range(0, 9999);
    if (recordsError) console.error('loadProjects records:', recordsError);

    const recordsByProject = new Map<string, TreeRecord[]>();
    for (const r of recordRows ?? []) {
      const list = recordsByProject.get(r.project_id) ?? [];
      list.push({
        id: r.id,
        diameter: Number(r.diameter),
        species: r.species as TreeRecord['species'],
        location: r.location,
        note: r.note ?? '',
      });
      recordsByProject.set(r.project_id, list);
    }

    setProjects(
      projectRows.map((p) => ({
        id: p.id,
        name: p.name,
        records: recordsByProject.get(p.id) ?? [],
        createdAt: p.created_at,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadProjects();
  }, [authed, loadProjects]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  // 레코드 업데이트 (로컬 state + 변경 추적)
  const setRecords = useCallback(
    (updater: TreeRecord[] | ((prev: TreeRecord[]) => TreeRecord[])) => {
      dirtyRef.current = true;
      setIsDirty(true);
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedId) return p;
          const oldRecords = p.records;
          const newRecords = typeof updater === 'function' ? updater(oldRecords) : updater;

          // 변경 추적
          const pending = pendingRef.current;
          const oldIds = new Set(oldRecords.map((r) => r.id));
          const newIds = new Set(newRecords.map((r) => r.id));

          // 삭제된 레코드 (old에는 있고 new에는 없음)
          for (const r of oldRecords) {
            if (!newIds.has(r.id) && !r._isNew) {
              pending.deletes.push(r.id);
              pending.updates.delete(r.id);
            }
          }

          // 추가/수정된 레코드
          for (const r of newRecords) {
            if (r._isNew || !oldIds.has(r.id)) {
              // 새 레코드 (중복 방지)
              if (!pending.inserts.some((ins) => ins.id === r.id)) {
                pending.inserts.push(r);
              } else {
                // 이미 inserts에 있으면 업데이트
                pending.inserts = pending.inserts.map((ins) =>
                  ins.id === r.id ? r : ins,
                );
              }
            } else {
              // 기존 레코드 수정
              const old = oldRecords.find((o) => o.id === r.id);
              if (old && (old.diameter !== r.diameter || old.species !== r.species || old.location !== r.location || (old.note ?? '') !== (r.note ?? ''))) {
                pending.updates.set(r.id, r);
              }
            }
          }

          pending.allRecords = newRecords;
          return { ...p, records: newRecords };
        }),
      );
    },
    [selectedId],
  );

  // 레코드 DB 동기화 (변경 기반 sync)
  const doSync = useCallback(
    async (_records: TreeRecord[], projectId: string) => {
      const changes = { ...pendingRef.current };
      // sync 전에 pending 초기화 (sync 중 새 변경은 다음 cycle로)
      pendingRef.current = {
        updates: new Map(),
        inserts: [],
        deletes: [],
        allRecords: changes.allRecords,
      };

      setSyncStatus('syncing');
      setSyncError('');
      // pending이 비어있으면 full sync (복원 등 전체 교체 시)
      const hasChanges = changes.updates.size > 0 || changes.inserts.length > 0 || changes.deletes.length > 0;
      const result = hasChanges
        ? await syncChanges(changes, projectId)
        : await syncRecords(changes.allRecords, projectId);
      setSyncStatus(result.status);
      if (result.error) setSyncError(result.error);

      // Only patch temp IDs → real IDs (never replace entire state)
      if (result.idMappings && result.idMappings.length > 0) {
        const map = new Map(result.idMappings.map((m) => [m.tempId, m.realId]));
        dirtyRef.current = false;
        setIsDirty(false);
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              records: p.records.map((r) => {
                const realId = map.get(r.id);
                return realId != null ? { ...r, id: realId, _isNew: undefined } : r;
              }),
            };
          }),
        );
      }

      // 에러 시 변경분 복원 (재시도용)
      if (result.status === 'error' || result.status === 'syncing') {
        const p = pendingRef.current;
        changes.updates.forEach((v, k) => { if (!p.updates.has(k)) p.updates.set(k, v); });
        changes.inserts.forEach((ins) => {
          if (!p.inserts.some((i) => i.id === ins.id)) p.inserts.push(ins);
        });
        changes.deletes.forEach((id) => {
          if (!p.deletes.includes(id)) p.deletes.push(id);
        });
      } else {
        dirtyRef.current = false;
        setIsDirty(false);
      }
    },
    [],
  );

  const handleHistoryRestore = useCallback(
    (restoredRecords: TreeRecord[]) => {
      if (!selectedId) return;
      dirtyRef.current = true;
      setIsDirty(true);
      // 복원은 전체 교체 → pending 초기화, full sync로 처리
      pendingRef.current = {
        updates: new Map(),
        inserts: [],
        deletes: [],
        allRecords: restoredRecords,
      };
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedId ? { ...p, records: restoredRecords } : p,
        ),
      );
    },
    [selectedId],
  );

  // 수동 저장
  const handleSave = useCallback(() => {
    if (!selected || !dirtyRef.current) return;
    doSync(selected.records, selected.id);
  }, [selected, doSync]);

  // 온라인/오프라인 감지
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus('synced');
      // Flush offline queue
      flushOfflineQueue((projectId) => {
        const project = projects.find((p) => p.id === projectId);
        return project?.records;
      });
    };
    const handleOffline = () => setSyncStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial status
    if (!navigator.onLine) setSyncStatus('offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [projects]);

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

  const deleteProject = async (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    if (!confirm(`"${target.name}" 프로젝트를 삭제하시겠습니까?\n(데이터 ${target.records.length}건 포함)`))
      return;
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

  const darkToggle = (
    <button
      onClick={() => setDark((d) => !d)}
      className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer
        text-gray-500 hover:bg-gray-100 active:bg-gray-200
        dark:text-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600
        transition-colors text-lg shrink-0"
      title={dark ? '라이트 모드' : '다크 모드'}
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

  // 프로젝트 목록 화면
  if (!selected) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="max-w-lg mx-auto p-4">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">수목 전정 현황</h1>
            {darkToggle}
          </div>

          <div className="flex flex-col gap-2.5 mb-6">
            {projects.length === 0 && !showNewInput && (
              <p className="text-gray-400 dark:text-gray-500 py-12 text-center">
                프로젝트가 없습니다.<br />새로 만들어주세요.
              </p>
            )}
            {projects.map((p) => {
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
                    <div className="font-medium truncate text-gray-900 dark:text-gray-100">{p.name}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {validCount}건 &middot; {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(p.id);
                    }}
                    className="text-red-400 hover:text-red-500 active:text-red-600 cursor-pointer
                      text-sm px-3 py-2 shrink-0 -mr-1"
                  >
                    삭제
                  </button>
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
            onClick={() => setSelectedId(null)}
            className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer
              text-gray-400 hover:bg-gray-100 active:bg-gray-200
              dark:hover:bg-gray-700 dark:active:bg-gray-600
              transition-colors text-lg shrink-0"
            title="프로젝트 목록"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate text-gray-900 dark:text-gray-100">
              {selected.name}
            </h1>
            <SyncIndicator status={syncStatus} errorMsg={syncError} />
          </div>
          <button
            onClick={() => setShowHistory(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer
              text-gray-500 hover:bg-gray-100 active:bg-gray-200
              dark:text-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600
              transition-colors text-lg shrink-0"
            title="변경 이력"
          >
            ↺
          </button>
          {darkToggle}
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
          <button className={tabClass('input')} onClick={() => setActiveTab('input')}>
            입력
          </button>
          <button className={tabClass('result')} onClick={() => setActiveTab('result')}>
            결과 ({validCount}건)
          </button>
        </div>

        {activeTab === 'input' ? (
          <InputTab records={selected.records} setRecords={setRecords} projectName={selected.name} disabled={showHistory} onSave={handleSave} isDirty={isDirty} syncStatus={syncStatus} />
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
