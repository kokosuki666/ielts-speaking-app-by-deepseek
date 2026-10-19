export type Part = 1 | 2 | 3;

export interface Question {
  id: string;
  part: Part;
  topic: string;
  topicZh: string;
  question: string;
  questionZh?: string;
  bullets?: string[];
  tags: string[];
  difficulty: 1 | 2 | 3;
  bankId: string;
  createdAt: number;
}

export interface Bank {
  id: string;
  name: string;
  source: 'builtin' | 'import';
  importedAt: number;
  questionCount: number;
  topics: string[];
  fileName?: string;
}

export interface Paper {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  part1Ids: string[];
  part2Id: string | null;
  part3Ids: string[];
  note?: string;
}

export interface ExamAnswer {
  questionId: string;
  part: Part;
  question: string;
  bullets?: string[];
  transcript: string;
  durationSec: number;
  wordCount: number;
  recordingUrl?: string;
  skipped?: boolean;
}

export interface Evidence {
  quote: string;
  comment: string;
  upgrade?: string;
}

export interface CriterionScore {
  band: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  evidence: Evidence[];
}

export type CriteriaKey = 'fluency' | 'lexical' | 'grammar' | 'pronunciation';

export interface PriorityItem {
  title: string;
  why: string;
  actions: string[];
}

export interface PlanWeek {
  week: number;
  focus: string;
  tasks: string[];
}

export interface TargetPlan {
  targetBand: number;
  gap: number;
  verdict: string;
  weeks: PlanWeek[];
}

export interface SampleUpgrade {
  questionId?: string;
  question: string;
  answer: string;
  keyPhrases: string[];
}

export interface VocabSuggestion {
  term: string;
  meaningZh: string;
  example: string;
  type: VocabType;
}

export interface ExamReport {
  id: string;
  paperId?: string;
  paperName: string;
  createdAt: number;
  overall: number;
  criteria: Record<CriteriaKey, CriterionScore>;
  overview: string;
  priorities: PriorityItem[];
  sampleUpgrades: SampleUpgrade[];
  vocabSuggestions: VocabSuggestion[];
  plan?: TargetPlan;
  targetBand: number;
  engine: 'ai' | 'local';
  answers: ExamAnswer[];
  notes?: string;
}

export type VocabType = 'word' | 'collocation' | 'idiom' | 'phrase' | 'discourse';
export type VocabLevel = 'band6' | 'band7' | 'band8';

export interface VocabItem {
  id: string;
  topic: string;
  topicZh: string;
  term: string;
  phonetic?: string;
  meaningZh: string;
  meaningEn?: string;
  example: string;
  exampleZh?: string;
  type: VocabType;
  level: VocabLevel;
  source: 'builtin' | 'ai' | 'chat' | 'manual' | 'import';
  createdAt: number;
}

export interface VocabProgress {
  box: number;
  dueAt: number;
  correct: number;
  wrong: number;
  lastSeen?: number;
  mastered?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface ChatVocab {
  term: string;
  meaningZh: string;
  example: string;
  type: VocabType;
  register?: string;
}

export interface ChatCorrection {
  said: string;
  better: string;
  why: string;
}

export interface ChatSummary {
  title: string;
  highlights: string[];
  vocab: ChatVocab[];
  corrections: ChatCorrection[];
  overall: string;
}

export interface ChatSession {
  id: string;
  topic: string;
  topicZh: string;
  scenario: string;
  mode: 'casual' | 'ielts';
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  summary?: ChatSummary;
}

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  useServerDefault: boolean;
}

export interface SpeechSettings {
  provider: 'browser' | 'edge' | 'openai';
  voiceURI: string;
  cloudVoice: string;
  ttsModel: string;
  rate: number;
  autoSpeak: boolean;
  autoTranscribe: boolean;
}

export interface ExamPrefs {
  part1Seconds: number;
  prepSeconds: number;
  part2Seconds: number;
  part3Seconds: number;
  examinerSpeaks: boolean;
}

export interface Settings {
  targetBand: number;
  theme: 'light' | 'dark';
  appearance: Appearance;
  ai: AiSettings;
  speech: SpeechSettings;
  exam: ExamPrefs;
  dailyGoal: number;
}

export type ThemeId =
  | 'liquid' | 'aurora' | 'sunset' | 'coast' | 'forest'
  | 'sakura' | 'violet' | 'midnight' | 'paper' | 'minimal';

export interface Appearance {
  themeId: ThemeId;
  accent: string;
  alpha: number;
  blur: number;
  saturate: number;
  border: number;
  radius: number;
  glassButtons: boolean;
  grain: boolean;
  motion: boolean;
}

export interface ExamItem {
  questionId: string;
  part: Part;
  question: string;
  questionZh?: string;
  bullets?: string[];
  topic: string;
  topicZh: string;
}

export interface ExamRun {
  paperId: string;
  paperName: string;
  startedAt: number;
  items: ExamItem[];
  answers: Record<string, ExamAnswer>;
  currentIndex: number;
  finished: boolean;
}

export interface ChatDraft {
  topic: string;
  topicZh: string;
  scenario: string;
  mode: 'casual' | 'ielts';
  userLevel: string;
}

export type RouteKey =
  | 'home'
  | 'library'
  | 'papers'
  | 'builder'
  | 'exam'
  | 'report'
  | 'chat'
  | 'vocab'
  | 'settings';
