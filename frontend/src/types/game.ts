// Shapes returned by the FastAPI backend (backend/app/main.py, backend/app/services/attempts.py).

export type AttemptStatus =
  | 'recording'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'upload_failed'
  | 'judge_failed'
  | 'expired'
  | 'replaced';

export interface Question {
  id: string;
  text: string;
  category: string;
  difficulty: string;
  context: string | null;
}

export interface CategoryFeedback {
  accuracy: string;
  confidence: string;
  delivery: string;
}

// Category values are arcade points (0-5000). The backend computes final_score.
export interface Score {
  accuracy: number;
  confidence: number;
  delivery: number;
  final_score: number;
  feedback: CategoryFeedback;
}

export interface Attempt {
  id: string;
  day: string;
  status: AttemptStatus;
  created: number;
  deadline: number;
  replacement_of: string | null;
  failure: string | null;
  question: Question;
  demo: boolean;
  score: Score | null;
}

export interface LeaderboardEntry {
  rank: number;
  alias: string;
  final_score: number;
  accuracy: number;
  confidence: number;
  delivery: number;
}

export interface Leaderboard {
  day: string;
  timezone: string;
  demo: boolean;
  entries: LeaderboardEntry[];
}
