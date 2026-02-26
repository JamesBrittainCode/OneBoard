export type Category = 'Strong Thinking' | 'Needs Clarification' | 'Misconception' | null;

export interface Session {
  id: number;
  prompt: string;
  joinCode: string;
  createdAt: string;
  active: boolean;
}

export interface ResponseCard {
  id: number;
  sessionId: number;
  content: string;
  createdAt: string;
  category: Category;
}
