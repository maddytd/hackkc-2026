// Single connection point between the UI and the FastAPI backend (see backend/README.md).
//
// Set VITE_API_URL (e.g. http://localhost:8000) to talk to the real server. With it unset,
// the data calls fall back to mock data so the UI runs standalone during design.
import type { Attempt, Leaderboard } from '../types/game';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const TOKEN_KEY = 'larple_token';
const ALIAS_KEY = 'larple_alias';

// True when a real backend is configured; false means the UI runs on mock data.
export const apiConfigured = Boolean(API_URL);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// --- session token (kept per-browser; the backend issues a 7-day bearer token) ---
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — token lives only for this page load */
  }
}

// The signed-in username, used to highlight your row on the leaderboard.
export function getAlias(): string | null {
  try {
    return localStorage.getItem(ALIAS_KEY);
  } catch {
    return null;
  }
}

function setAlias(alias: string | null) {
  try {
    if (alias) localStorage.setItem(ALIAS_KEY, alias);
    else localStorage.removeItem(ALIAS_KEY);
  } catch {
    /* storage unavailable — no highlight */
  }
}

export function isAuthed(): boolean {
  return getToken() !== null;
}

interface ReqOptions {
  method?: string;
  body?: unknown;
  raw?: boolean; // send body as-is (used for the video Blob upload)
  auth?: boolean;
  headers?: Record<string, string>;
}

async function req<T>(path: string, opts: ReqOptions = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'VITE_API_URL is not set');
  const { method = 'GET', body, raw = false, auth = true, headers = {} } = opts;
  const h: Record<string, string> = { ...headers };
  const token = getToken();
  if (auth && token) h.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (raw) payload = body as BodyInit;
    else {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(`${API_URL}${path}`, { method, headers: h, body: payload });
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A dead/expired session token is useless — drop it so the app can re-auth.
    if (res.status === 401) setToken(null);
    const detail = (data && (data.detail as string)) || res.statusText;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

// --- auth ---
export interface Session {
  access_token: string;
  token_type: string;
  player_id: string;
  alias: string;
  expires_at: number;
}

export async function register(alias: string, password: string): Promise<Session> {
  const s = await req<Session>('/auth/register', {
    method: 'POST',
    auth: false,
    body: { alias, password },
  });
  setToken(s.access_token);
  setAlias(s.alias);
  return s;
}

export async function login(alias: string, password: string): Promise<Session> {
  const s = await req<Session>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { alias, password },
  });
  setToken(s.access_token);
  setAlias(s.alias);
  return s;
}

export async function logout(): Promise<void> {
  if (API_URL && getToken()) {
    try {
      await req<null>('/auth/session', { method: 'DELETE' });
    } catch {
      /* ignore network/expiry errors on logout */
    }
  }
  setToken(null);
  setAlias(null);
}

// --- game ---

// GET /health — process status, judging mode, and whether day-switching is allowed.
export async function getHealth(): Promise<{
  status: string;
  judge_mode: string;
  day_override?: boolean;
}> {
  if (!API_URL) return { status: 'ok', judge_mode: 'demo', day_override: true };
  return req('/health', { auth: false });
}

// POST /attempts — start or recover a day's attempt (requires consent + auth).
// `day` is honored only in demo mode (the day-switcher); otherwise the server uses today.
export async function startAttempt(day?: string): Promise<Attempt> {
  if (!API_URL) return mockAttempt(day);
  return req<Attempt>(`/attempts${day ? `?day=${day}` : ''}`, {
    method: 'POST',
    body: { consent_to_ai_processing: true },
  });
}

// GET /attempts/current — that day's attempt, or null.
export async function currentAttempt(day?: string): Promise<Attempt | null> {
  if (!API_URL) return null;
  return req<Attempt | null>(`/attempts/current${day ? `?day=${day}` : ''}`);
}

// GET /attempts/{id}
export async function getAttempt(attemptId: string): Promise<Attempt> {
  if (!API_URL) return mockCompleted();
  return req<Attempt>(`/attempts/${attemptId}`);
}

// POST /attempts/{id}/replacement — new question after a confirmed failed upload.
export async function requestReplacement(attemptId: string): Promise<Attempt> {
  return req<Attempt>(`/attempts/${attemptId}/replacement`, { method: 'POST' });
}

// PUT /attempts/{id}/video — send the raw recording Blob (not FormData).
export async function uploadRecording(attemptId: string, blob: Blob): Promise<Attempt> {
  if (!API_URL) return mockCompleted();
  return req<Attempt>(`/attempts/${attemptId}/video`, {
    method: 'PUT',
    raw: true,
    body: blob,
    headers: { 'Content-Type': blob.type.split(';')[0] },
  });
}

// GET /leaderboard
export async function getLeaderboard(day?: string): Promise<Leaderboard> {
  if (!API_URL) return mockLeaderboard(day);
  return req<Leaderboard>(`/leaderboard${day ? `?day=${day}` : ''}`);
}

// --- mock data (used only when VITE_API_URL is unset) ---
const MOCK_QUESTIONS = [
  { id: 'capital_australia', text: 'What is the capital of Australia?', category: 'geography', difficulty: 'medium', context: 'Name the city and sound sure of it.' },
  { id: 'gold_symbol', text: 'What is the chemical symbol for gold?', category: 'science', difficulty: 'easy', context: 'State the symbol and you may say why.' },
  { id: 'ww2_end', text: 'In what year did World War II end?', category: 'history', difficulty: 'easy', context: 'Give the year.' },
  { id: 'largest_ocean', text: 'What is the largest ocean on Earth?', category: 'geography', difficulty: 'easy', context: 'Name the ocean.' },
  { id: 'romeo_author', text: 'Who wrote the play Romeo and Juliet?', category: 'literature', difficulty: 'easy', context: 'Name the author.' },
] as const;

const todayISO = () => new Date().toISOString().slice(0, 10);

function hashDay(day: string): number {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

let lastMock: Attempt | null = null;

function mockAttempt(day?: string): Attempt {
  const d = day ?? todayISO();
  const q = MOCK_QUESTIONS[hashDay(d) % MOCK_QUESTIONS.length];
  const created = Date.now() / 1000;
  lastMock = {
    id: 'mock-attempt',
    day: d,
    status: 'recording',
    created,
    deadline: created + 150,
    replacement_of: null,
    failure: null,
    demo: true,
    score: null,
    question: { ...q, context: q.context },
  };
  return lastMock;
}

function mockCompleted(): Attempt {
  const base = lastMock ?? mockAttempt();
  return {
    ...base,
    status: 'completed',
    score: {
      accuracy: 3500,
      confidence: 4000,
      delivery: 3000,
      final_score: 3500,
      feedback: {
        accuracy: 'Solid, though a concrete detail would sharpen it. (mock)',
        confidence: 'Steady and convincing — you committed to the answer. (mock)',
        delivery: 'Clear, but the pacing rushed near the end. (mock)',
      },
    },
  };
}

function mockLeaderboard(day?: string): Leaderboard {
  return {
    day: day ?? todayISO(),
    timezone: 'UTC',
    demo: true,
    entries: [
      { rank: 1, alias: 'Nova', final_score: 4650, accuracy: 4500, confidence: 5000, delivery: 4450 },
      { rank: 2, alias: 'Pixel', final_score: 4210, accuracy: 4000, confidence: 4300, delivery: 4330 },
      { rank: 3, alias: 'Echo', final_score: 3500, accuracy: 3500, confidence: 3500, delivery: 3500 },
    ],
  };
}
