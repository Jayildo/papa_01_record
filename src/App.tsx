import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, TreeRecord, SyncStatus } from './types';
import { supabase } from './lib/supabase';
import { syncRecords, flushOfflineQueue } from './utils/syncEngine';
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
      .order('sort_order', { ascending: true });
    if (recordsError) console.error('loadProjects records:', recordsError);

    const recordsByProject = new Map<string, TreeRecord[]>();
    for (const r of recordRows ?? []) {
      const list = recordsByProject.get(r.project_id) ?? [];
      list.push({
        id: r.id,
        diameter: Number(r.diameter),
        species: r.species as TreeRecord['species'],
        location: r.location,
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

  // 레코드 업데이트 (로컬 state + DB 동기화)
  const setRecords = useCallback(
    (updater: TreeRecord[] | ((prev: TreeRecord[]) => TreeRecord[])) => {
      dirtyRef.current = true; // 사용자가 수정함 → sync 허용
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedId) return p;
          const newRecords = typeof updater === 'function' ? updater(p.records) : updater;
          return { ...p, records: newRecords };
        }),
      );
    },
    [selectedId],
  );

  // 레코드 DB 동기화 (sync engine 사용)
  const doSync = useCallback(
    async (records: TreeRecord[], projectId: string) => {
      setSyncStatus('syncing');
      setSyncError('');
      const result = await syncRecords(records, projectId);
      setSyncStatus(result.status);
      if (result.error) setSyncError(result.error);

      // 새로 INSERT된 레코드가 있을 때만 ID 업데이트 (무한 루프 방지)
      if (result.updatedRecords) {
        const hasNewIds = result.updatedRecords.some(
          (r, i) => r.id !== records[i]?.id,
        );
        if (hasNewIds) {
          dirtyRef.current = false; // ID 업데이트는 사용자 수정이 아님
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectId ? { ...p, records: result.updatedRecords! } : p,
            ),
          );
        }
      }
      dirtyRef.current = false;
    },
    [],
  );

  const handleHistoryRestore = useCallback(
    (restoredRecords: TreeRecord[]) => {
      if (!selectedId) return;
      dirtyRef.current = true; // 복원도 변경이므로 sync 허용
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedId ? { ...p, records: restoredRecords } : p,
        ),
      );
    },
    [selectedId],
  );

  // 디바운스된 저장 — dirty일 때만 (DB에서 방금 로드한 데이터는 sync 안 함)
  useEffect(() => {
    if (!selected || !dirtyRef.current) return;
    const timer = setTimeout(() => {
      doSync(selected.records, selected.id);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.records]);

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
          <InputTab records={selected.records} setRecords={setRecords} projectName={selected.name} />
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
