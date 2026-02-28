export type Category = 'Strong Thinking' | 'Needs Clarification' | 'Misconception' | null;
export type BoardMode = 'categorized' | 'open';
export type ReactionType = 'helpful' | 'interesting' | 'need_example';

export interface Session {
  id: number;
  prompt: string;
  joinCode: string;
  createdAt: string;
  active: boolean;
  boardMode: BoardMode;
  anonymousMode: boolean;
  sectionLabels: [string, string, string];
  submissionsFrozen: boolean;
  studentCanViewResponses: boolean;
  archived: boolean;
  activeStartedAt: string | null;
  timerHistory: Array<{
    startedAt: string;
    endedAt: string;
    seconds: number;
  }>;
}

export interface ResponseCard {
  id: number;
  sessionId: number;
  content: string;
  createdAt: string;
  category: Category;
  studentName: string | null;
  reactionCounts: {
    helpful: number;
    interesting: number;
    needExample: number;
  };
  myReaction: ReactionType | null;
}
