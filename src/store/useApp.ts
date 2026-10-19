import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Bank,
  ChatSession,
  ExamAnswer,
  ExamReport,
  ExamRun,
  Paper,
  Question,
  Settings,
  VocabItem,
  VocabProgress,
  VocabType,
} from '../types';
import { uid } from '../lib/id';
import { loadBuiltinQuestions, loadBuiltinVocab } from '../lib/data';
import { DEFAULT_APPEARANCE } from '../lib/appearance';
import { schedule } from '../lib/srs';
import type { ParsedQuestion } from '../lib/importBank';

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'err' | 'info';
}

export interface QuestionDraft {
  part: 1 | 2 | 3;
  topic: string;
  topicZh: string;
  question: string;
  questionZh?: string;
  bullets?: string[];
  tags?: string[];
  difficulty?: 1 | 2 | 3;
}

interface AppState {
  seeded: boolean;
  banks: Bank[];
  questions: Question[];
  papers: Paper[];
  reports: ExamReport[];
  chats: ChatSession[];
  vocab: VocabItem[];
  progress: Record<string, VocabProgress>;
  settings: Settings;
  examRun: ExamRun | null;
  activeReportId: string | null;
  toast: Toast | null;

  notify: (text: string, tone?: Toast['tone']) => void;
  patchSettings: (patch: Partial<Omit<Settings, 'ai' | 'speech' | 'asr' | 'exam'>> & {
    ai?: Partial<Settings['ai']>;
    speech?: Partial<Settings['speech']>;
    asr?: Partial<Settings['asr']>;
    exam?: Partial<Settings['exam']>;
  }) => void;

  importBank: (name: string, items: ParsedQuestion[], fileName?: string) => Bank;
  addQuestion: (draft: QuestionDraft & { bankId?: string }) => Question;
  updateQuestion: (id: string, patch: Partial<QuestionDraft>) => void;
  deleteQuestions: (ids: string[]) => void;
  deleteBank: (id: string) => void;

  createPaper: (input: { name: string; part1Ids: string[]; part2Id: string | null; part3Ids: string[]; note?: string }) => Paper;
  updatePaper: (id: string, patch: Partial<Pick<Paper, 'name' | 'part1Ids' | 'part2Id' | 'part3Ids' | 'note'>>) => void;
  deletePaper: (id: string) => void;

  startExam: (paper: Paper) => void;
  setAnswer: (answer: ExamAnswer) => void;
  setExamIndex: (index: number) => void;
  finishExam: () => void;
  clearExam: () => void;

  saveReport: (report: ExamReport) => void;
  deleteReport: (id: string) => void;
  setActiveReport: (id: string | null) => void;

  addVocabItems: (items: Omit<VocabItem, 'id' | 'createdAt'>[]) => number;
  deleteVocabTopic: (topic: string) => void;
  reviewVocab: (id: string, quality: 'again' | 'hard' | 'good') => void;

  createChat: (session: Omit<ChatSession, 'id' | 'createdAt' | 'updatedAt' | 'messages'>) => ChatSession;
  updateChat: (id: string, patch: Partial<ChatSession>) => void;
  deleteChat: (id: string) => void;

  resetAll: () => void;
  exportData: () => unknown;
  importData: (payload: unknown) => boolean;
}

const DEFAULT_SETTINGS: Settings = {
  targetBand: 7,
  theme: 'light',
  appearance: DEFAULT_APPEARANCE,
  ai: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    temperature: 0.6,
    useServerDefault: false,
  },
  speech: {
    provider: 'edge',
    voiceURI: '',
    cloudVoice: 'en-GB-SoniaNeural',
    ttsModel: 'tts-1',
    rate: 1,
    autoSpeak: true,
    autoTranscribe: true,
  },
  asr: {
    provider: 'browser',
    model: 'whisper-1',
    language: 'en',
    baseUrl: '',
    apiKey: '',
  },
  exam: {
    part1Seconds: 180,
    prepSeconds: 60,
    part2Seconds: 120,
    part3Seconds: 240,
    examinerSpeaks: true,
  },
  dailyGoal: 20,
};

function seed(): { banks: Bank[]; questions: Question[]; vocab: VocabItem[] } {
  const { bank, questions } = loadBuiltinQuestions();
  return { banks: [bank], questions, vocab: loadBuiltinVocab() };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      seeded: false,
      banks: [],
      questions: [],
      papers: [],
      reports: [],
      chats: [],
      vocab: [],
      progress: {},
      settings: DEFAULT_SETTINGS,
      examRun: null,
      activeReportId: null,
      toast: null,

      notify: (text, tone = 'ok') => {
        const toast = { id: Date.now(), text, tone };
        set({ toast });
        window.setTimeout(() => {
          if (get().toast?.id === toast.id) set({ toast: null });
        }, 2600);
      },

      patchSettings: (patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...patch,
            ai: { ...state.settings.ai, ...(patch.ai ?? {}) },
            speech: { ...state.settings.speech, ...(patch.speech ?? {}) },
            asr: { ...state.settings.asr, ...(patch.asr ?? {}) },
            exam: { ...state.settings.exam, ...(patch.exam ?? {}) },
          },
        })),

      importBank: (name, items, fileName) => {
        const bankId = uid('bank');
        const now = Date.now();
        const questions: Question[] = items.map((q) => ({
          ...q,
          id: uid('q'),
          bankId,
          createdAt: now,
        }));
        const bank: Bank = {
          id: bankId,
          name: name.trim() || '导入题库',
          source: 'import',
          importedAt: now,
          questionCount: questions.length,
          topics: [...new Set(questions.map((q) => q.topic))],
          fileName,
        };
        set((state) => ({ banks: [bank, ...state.banks], questions: [...questions, ...state.questions] }));
        return bank;
      },

      addQuestion: (draft) => {
        const bankId = draft.bankId ?? get().banks[0]?.id ?? 'bank_builtin';
        const question: Question = {
          id: uid('q'),
          part: draft.part,
          topic: draft.topic,
          topicZh: draft.topicZh,
          question: draft.question,
          questionZh: draft.questionZh,
          bullets: draft.part === 2 ? draft.bullets : undefined,
          tags: draft.tags ?? [],
          difficulty: draft.difficulty ?? 2,
          bankId,
          createdAt: Date.now(),
        };
        set((state) => ({
          questions: [question, ...state.questions],
          banks: state.banks.map((b) =>
            b.id === bankId
              ? {
                  ...b,
                  questionCount: b.questionCount + 1,
                  topics: [...new Set([...b.topics, question.topic])],
                }
              : b,
          ),
        }));
        return question;
      },

      updateQuestion: (id, patch) =>
        set((state) => ({
          questions: state.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
        })),

      deleteQuestions: (ids) =>
        set((state) => {
          const questions = state.questions.filter((q) => !ids.includes(q.id));
          return {
            questions,
            papers: state.papers.map((p) => ({
              ...p,
              part1Ids: p.part1Ids.filter((x) => !ids.includes(x)),
              part3Ids: p.part3Ids.filter((x) => !ids.includes(x)),
              part2Id: p.part2Id && ids.includes(p.part2Id) ? null : p.part2Id,
            })),
            banks: state.banks.map((b) => {
              const own = questions.filter((q) => q.bankId === b.id);
              return {
                ...b,
                questionCount: own.length,
                topics: [...new Set(own.map((q) => q.topic))],
              };
            }),
          };
        }),

      deleteBank: (id) =>
        set((state) => {
          if (id === 'bank_builtin') return state;
          return {
            banks: state.banks.filter((b) => b.id !== id),
            questions: state.questions.filter((q) => q.bankId !== id),
          };
        }),

      createPaper: (input) => {
        const now = Date.now();
        const paper: Paper = {
          id: uid('paper'),
          name: input.name,
          createdAt: now,
          updatedAt: now,
          part1Ids: input.part1Ids,
          part2Id: input.part2Id,
          part3Ids: input.part3Ids,
          note: input.note,
        };
        set((state) => ({ papers: [paper, ...state.papers] }));
        return paper;
      },

      updatePaper: (id, patch) =>
        set((state) => ({
          papers: state.papers.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
        })),

      deletePaper: (id) => set((state) => ({ papers: state.papers.filter((p) => p.id !== id) })),

      startExam: (paper) => {
        const all = get().questions;
        const part1 = paper.part1Ids.map((id) => all.find((q) => q.id === id)).filter(Boolean) as Question[];
        const part2 = paper.part2Id ? all.find((q) => q.id === paper.part2Id) : null;
        const part3 = paper.part3Ids.map((id) => all.find((q) => q.id === id)).filter(Boolean) as Question[];
        const items = [...part1, ...(part2 ? [part2] : []), ...part3].map((q) => ({
          questionId: q.id,
          part: q.part,
          question: q.question,
          questionZh: q.questionZh,
          bullets: q.bullets,
          topic: q.topic,
          topicZh: q.topicZh,
        }));
        set({
          examRun: {
            paperId: paper.id,
            paperName: paper.name,
            startedAt: Date.now(),
            items,
            answers: {},
            currentIndex: 0,
            finished: false,
          },
        });
      },

      setAnswer: (answer) =>
        set((state) =>
          state.examRun
            ? { examRun: { ...state.examRun, answers: { ...state.examRun.answers, [answer.questionId]: answer } } }
            : state,
        ),

      setExamIndex: (index) =>
        set((state) => (state.examRun ? { examRun: { ...state.examRun, currentIndex: index } } : state)),

      finishExam: () => set((state) => (state.examRun ? { examRun: { ...state.examRun, finished: true } } : state)),

      clearExam: () => set({ examRun: null }),

      saveReport: (report) =>
        set((state) => ({
          reports: [report, ...state.reports.filter((r) => r.id !== report.id)].slice(0, 100),
          activeReportId: report.id,
          examRun: null,
        })),

      deleteReport: (id) =>
        set((state) => ({
          reports: state.reports.filter((r) => r.id !== id),
          activeReportId: state.activeReportId === id ? null : state.activeReportId,
        })),

      setActiveReport: (id) => set({ activeReportId: id }),

      addVocabItems: (items) => {
        const existing = new Set(get().vocab.map((v) => `${v.topic}|${v.term.toLowerCase()}`));
        const fresh = items
          .filter((item) => !existing.has(`${item.topic}|${item.term.toLowerCase()}`))
          .map((item) => ({ ...item, id: uid('v'), createdAt: Date.now() }));
        if (!fresh.length) return 0;
        set((state) => ({ vocab: [...fresh, ...state.vocab] }));
        return fresh.length;
      },

      deleteVocabTopic: (topic) =>
        set((state) => ({
          vocab: state.vocab.filter((v) => v.topic !== topic || v.source === 'builtin'),
          progress: Object.fromEntries(
            Object.entries(state.progress).filter(([id]) => state.vocab.some((v) => v.id === id && (v.topic !== topic || v.source === 'builtin'))),
          ),
        })),

      reviewVocab: (id, quality) =>
        set((state) => {
          const prev = state.progress[id];
          const next = schedule(prev?.box ?? 0, prev?.dueAt ?? 0, quality);
          return {
            progress: {
              ...state.progress,
              [id]: {
                box: next.box,
                dueAt: next.dueAt,
                correct: (prev?.correct ?? 0) + (quality === 'again' ? 0 : 1),
                wrong: (prev?.wrong ?? 0) + (quality === 'again' ? 1 : 0),
                lastSeen: Date.now(),
              },
            },
          };
        }),

      createChat: (input) => {
        const now = Date.now();
        const session: ChatSession = {
          ...input,
          id: uid('chat'),
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        set((state) => ({ chats: [session, ...state.chats] }));
        return session;
      },

      updateChat: (id, patch) =>
        set((state) => ({
          chats: state.chats.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)),
        })),

      deleteChat: (id) => set((state) => ({ chats: state.chats.filter((c) => c.id !== id) })),

      resetAll: () => {
        const fresh = seed();
        set({
          seeded: true,
          banks: fresh.banks,
          questions: fresh.questions,
          vocab: fresh.vocab,
          papers: [],
          reports: [],
          chats: [],
          progress: {},
          examRun: null,
          activeReportId: null,
          settings: DEFAULT_SETTINGS,
        });
      },

      exportData: () => {
        const { banks, questions, papers, reports, chats, vocab, progress, settings } = get();
        return { version: 2, exportedAt: Date.now(), banks, questions, papers, reports, chats, vocab, progress, settings };
      },

      importData: (payload) => {
        const data = payload as Partial<ReturnType<AppState['exportData']>> & Record<string, unknown>;
        if (!data || !Array.isArray(data.questions) || !Array.isArray(data.banks)) return false;
        set({
          banks: data.banks as Bank[],
          questions: data.questions as Question[],
          papers: (data.papers as Paper[]) ?? [],
          reports: (data.reports as ExamReport[]) ?? [],
          chats: (data.chats as ChatSession[]) ?? [],
          vocab: (data.vocab as VocabItem[]) ?? [],
          progress: (data.progress as Record<string, VocabProgress>) ?? {},
          settings: { ...DEFAULT_SETTINGS, ...(data.settings as Settings) },
          seeded: true,
        });
        return true;
      },
    }),
    {
      name: 'ielts-speaking-studio',
      version: 2,
      partialize: (state) => ({
        seeded: state.seeded,
        banks: state.banks,
        questions: state.questions,
        papers: state.papers,
        reports: state.reports,
        chats: state.chats,
        vocab: state.vocab,
        progress: state.progress,
        settings: state.settings,
        examRun: state.examRun,
        activeReportId: state.activeReportId,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings ?? {}),
            appearance: { ...DEFAULT_APPEARANCE, ...(p.settings?.appearance ?? {}) },
            ai: { ...DEFAULT_SETTINGS.ai, ...(p.settings?.ai ?? {}) },
            speech: { ...DEFAULT_SETTINGS.speech, ...(p.settings?.speech ?? {}) },
            asr: { ...DEFAULT_SETTINGS.asr, ...(p.settings?.asr ?? {}) },
            exam: { ...DEFAULT_SETTINGS.exam, ...(p.settings?.exam ?? {}) },
          },
        };
      },
    },
  ),
);

/** First-run seeding of the built-in bank and vocabulary deck. */
export function ensureSeeded(): void {
  const state = useApp.getState();
  if (state.seeded && state.questions.length) return;
  const fresh = seed();
  useApp.setState({
    seeded: true,
    banks: state.banks.length ? state.banks : fresh.banks,
    questions: state.questions.length ? state.questions : fresh.questions,
    vocab: state.vocab.length ? state.vocab : fresh.vocab,
  });
}

export const VOCAB_TYPES_ORDER: VocabType[] = ['word', 'collocation', 'idiom', 'phrase', 'discourse'];
