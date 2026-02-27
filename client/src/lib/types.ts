export type Category = 'Strong Thinking' | 'Needs Clarification' | 'Misconception' | null;
export type BoardMode = 'categorized' | 'open';

export interface Session {
  id: number;
  prompt: string;
  joinCode: string;
  createdAt: string;
  active: boolean;
  boardMode: BoardMode;
  anonymousMode: boolean;
  sectionLabels: [string, string, string];
}

export interface ResponseCard {
  id: number;
  sessionId: number;
  content: string;
  createdAt: string;
  category: Category;
  studentName: string | null;
}
