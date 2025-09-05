/**
 * Core types and interfaces for the Context Pruning MCP Server
 */

export interface ConversationMessage {
  readonly id: string;
  readonly timestamp: number;
  readonly type: MessageType;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly metadata: MessageMetadata;
}

export type MessageType =
  | 'query'
  | 'code_change'
  | 'file_operation'
  | 'error'
  | 'success'
  | 'tool_use'
  | 'summary';

export interface MessageMetadata {
  readonly tokenCount: number;
  readonly fileReferences: readonly string[];
  readonly codeBlocks: readonly CodeBlock[];
  readonly hasError: boolean;
  readonly toolsUsed: readonly string[];
  readonly importance?: ImportanceScore;
}

export interface CodeBlock {
  readonly language: string;
  readonly content: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly filePath?: string;
}

export interface ImportanceScore {
  readonly total: number;
  readonly recency: number;
  readonly semantic: number;
  readonly references: number;
  readonly fileRelevance: number;
  readonly coherence?: number;
  readonly computed: number;
  readonly breakdown?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  readonly bm25Score?: number;
  readonly transformerScore?: number;
  readonly contextualScore?: number;
  readonly threadContinuity?: number;
  readonly referenceChainStrength?: number;
  readonly informationDensity?: number;
}

export interface ConversationContext {
  readonly messages: readonly ConversationMessage[];
  readonly totalTokens: number;
  readonly activeFiles: readonly string[];
  readonly sessionStartTime: number;
  readonly lastPruneTime?: number;
  readonly systemContext?: SystemContext;
  readonly toolResultHistory?: readonly ToolResultContext[];
  readonly sessionMetadata?: SessionContext;
  readonly tokenBreakdown?: ContextTokenBreakdown;
}

export interface PruningStrategy {
  readonly name: 'aggressive' | 'balanced' | 'conservative';
  readonly maxTokens: number;
  readonly preserveRatio: number;
  readonly summaryRatio: number;
  readonly importanceThreshold: number;
  readonly alwaysPreserve: readonly MessageType[];
}

export interface PruningResult {
  readonly originalTokens: number;
  readonly finalTokens: number;
  readonly reductionPercent: number;
  readonly messagesRemoved: number;
  readonly messagesSummarized: number;
  readonly summariesCreated: readonly Summary[];
  readonly rollbackData: RollbackData;
}

export interface Summary {
  readonly id: string;
  readonly level: SummaryLevel;
  readonly content: string;
  readonly originalMessageIds: readonly string[];
  readonly tokensSaved: number;
  readonly timestamp: number;
}

export type SummaryLevel = 'immediate' | 'session' | 'project';

export interface RollbackData {
  readonly pruningId: string;
  readonly removedMessages: readonly ConversationMessage[];
  readonly originalOrder: readonly string[];
  readonly timestamp: number;
}

export interface PruningConfig {
  strategy: PruningStrategy;
  enableAutoTrigger: boolean;
  autoTriggerThreshold: number;
  enableRollback: boolean;
  maxRollbackHistory: number;
  logLevel: 'none' | 'basic' | 'detailed';
  scoringProfile?: ScoringProfile;
}

export interface ScoringProfile {
  readonly name: string;
  readonly weights: ScoringWeights;
  readonly semanticKeywords: readonly string[];
  readonly typeWeights: Record<MessageType, number>;
  readonly coherenceThreshold: number;
  readonly bm25Parameters: BM25Parameters;
  readonly hybridScoring: HybridScoringConfig;
}

export interface ScoringWeights {
  readonly recency: number;
  readonly semantic: number;
  readonly references: number;
  readonly fileRelevance: number;
  readonly coherence: number;
}

export interface BM25Parameters {
  readonly k1: number;  // Term frequency saturation parameter (typically 1.2-2.0)
  readonly b: number;   // Document length normalization parameter (typically 0.75)
}

export interface HybridScoringConfig {
  readonly bm25Weight: number;        // Weight for BM25 lexical matching
  readonly transformerWeight: number; // Weight for semantic transformer scoring  
  readonly contextualWeight: number;  // Weight for contextual/domain scoring
}

export interface AnalysisResult {
  readonly totalMessages: number;
  readonly totalTokens: number;
  readonly averageImportance: number;
  readonly redundancyScore: number;
  readonly recommendedStrategy: PruningStrategy['name'];
  readonly estimatedReduction: number;
}

export class ContextPruningError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: unknown
  ) {
    super(message);
    this.name = 'ContextPruningError';
  }
}

export const DEFAULT_STRATEGIES: Record<PruningStrategy['name'], PruningStrategy> = {
  aggressive: {
    name: 'aggressive' as const,
    maxTokens: 50000,
    preserveRatio: 0.3,
    summaryRatio: 0.4,
    importanceThreshold: 0.7,
    alwaysPreserve: ['error', 'code_change'] as const,
  },
  balanced: {
    name: 'balanced' as const,
    maxTokens: 75000,
    preserveRatio: 0.5,
    summaryRatio: 0.3,
    importanceThreshold: 0.5,
    alwaysPreserve: ['error', 'code_change', 'file_operation'] as const,
  },
  conservative: {
    name: 'conservative' as const,
    maxTokens: 100000,
    preserveRatio: 0.7,
    summaryRatio: 0.2,
    importanceThreshold: 0.3,
    alwaysPreserve: ['error', 'code_change', 'file_operation', 'tool_use'] as const,
  },
};

// Enhanced Context Type Definitions for Claude Code Token Tracking

export type ToolResultType = 
  | 'file_read'           // Read tool results
  | 'command_output'      // Bash tool results  
  | 'search_results'      // Grep/Glob tool results
  | 'mcp_response'        // MCP server responses
  | 'browser_result'      // Browser automation results
  | 'git_operation'       // Git command outputs
  | 'system_info';        // System/environment data

export interface ToolResultContext {
  readonly toolName: string;
  readonly executionId: string;
  readonly timestamp: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly resultType: ToolResultType;
  readonly content: string;
  readonly filePath: string | undefined;
  readonly relevanceScore: number;
  readonly accessFrequency: number;
  readonly lastAccessed: number;
  readonly contentHash: string;
  readonly isStale: boolean;
}

export interface SystemContext {
  readonly systemInstructions: string;
  readonly claudeMdContent: string;
  readonly claudeLocalMdContent?: string;
  readonly toolPermissions: ToolPermissionConfig[];
  readonly environmentVariables: Record<string, string>;
  readonly workingDirectory: string;
  readonly gitStatus?: string;
  readonly totalTokens: number;
}

export interface ToolPermissionConfig {
  readonly toolName: string;
  readonly permissionMode: 'allow' | 'deny' | 'prompt';
  readonly workingDirectories?: string[];
  readonly additionalRules?: string[];
}

export interface SessionContext {
  readonly sessionId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly contextWindowUsage: number;
  readonly contextWindowLimit: number;
  readonly autoCompactionHistory: CompactionEvent[];
  readonly parallelSessions: SessionReference[];
  readonly isApproachingLimit: boolean;
}

export interface CompactionEvent {
  readonly timestamp: number;
  readonly triggerReason: 'manual' | 'auto_95_percent' | 'user_request';
  readonly tokensBefore: number;
  readonly tokensAfter: number;
  readonly reductionPercent: number;
  readonly methodsUsed: string[];
}

export interface SessionReference {
  readonly sessionId: string;
  readonly startTime: number;
  readonly estimatedTokens: number;
  readonly isActive: boolean;
}

export interface ContextTokenBreakdown {
  readonly messageTokens: number;          // Basic user/assistant conversation
  readonly systemTokens: number;           // System instructions, CLAUDE.md
  readonly toolResultTokens: number;       // File contents, command outputs, search results
  readonly mcpResponseTokens: number;      // MCP server responses
  readonly backgroundTokens: number;       // Auto-compaction, summarization
  readonly totalTokens: number;
  readonly breakdown: TokenCategoryBreakdown[];
  readonly estimationAccuracy: number;     // Confidence in token count accuracy
}

export interface TokenCategoryBreakdown {
  readonly category: string;
  readonly tokenCount: number;
  readonly percentage: number;
  readonly examples: string[];
  readonly prunablePotential: number;     // Estimated prunable tokens in this category
}

export const DEFAULT_SCORING_PROFILES: Record<string, ScoringProfile> = {
  technical: {
    name: 'technical',
    weights: { recency: 0.2, semantic: 0.4, references: 0.2, fileRelevance: 0.15, coherence: 0.05 },
    semanticKeywords: [
      'error', 'bug', 'fix', 'implement', 'create', 'update', 'delete', 'refactor',
      'test', 'deploy', 'config', 'install', 'import', 'export', 'function', 'class',
      'method', 'variable', 'constant', 'interface', 'type', 'debug', 'compile',
      'build', 'package', 'dependency', 'version', 'branch', 'commit', 'merge'
    ],
    typeWeights: {
      error: 1.0, code_change: 0.95, file_operation: 0.9, tool_use: 0.8,
      query: 0.6, success: 0.4, summary: 0.3
    },
    coherenceThreshold: 0.7,
    bm25Parameters: { k1: 1.5, b: 0.75 },
    hybridScoring: { bm25Weight: 0.4, transformerWeight: 0.4, contextualWeight: 0.2 }
  },
  
  creative: {
    name: 'creative',
    weights: { recency: 0.3, semantic: 0.3, references: 0.15, fileRelevance: 0.1, coherence: 0.15 },
    semanticKeywords: [
      'idea', 'concept', 'design', 'create', 'brainstorm', 'iterate', 'sketch',
      'prototype', 'explore', 'experiment', 'imagine', 'visualize', 'inspire',
      'creative', 'innovative', 'original', 'artistic', 'aesthetic', 'style'
    ],
    typeWeights: {
      query: 0.8, code_change: 0.6, summary: 0.7, file_operation: 0.5,
      tool_use: 0.6, success: 0.5, error: 0.9
    },
    coherenceThreshold: 0.6,
    bm25Parameters: { k1: 1.2, b: 0.5 },
    hybridScoring: { bm25Weight: 0.3, transformerWeight: 0.5, contextualWeight: 0.2 }
  },

  problemSolving: {
    name: 'problemSolving', 
    weights: { recency: 0.25, semantic: 0.35, references: 0.25, fileRelevance: 0.1, coherence: 0.05 },
    semanticKeywords: [
      'problem', 'solution', 'fix', 'analyze', 'troubleshoot', 'debug', 'resolve',
      'investigate', 'diagnose', 'identify', 'root cause', 'workaround', 'patch',
      'issue', 'challenge', 'obstacle', 'barrier', 'blocker', 'solve', 'approach'
    ],
    typeWeights: {
      error: 1.0, query: 0.8, code_change: 0.7, tool_use: 0.75, file_operation: 0.6,
      success: 0.5, summary: 0.4
    },
    coherenceThreshold: 0.75,
    bm25Parameters: { k1: 1.4, b: 0.8 },
    hybridScoring: { bm25Weight: 0.35, transformerWeight: 0.4, contextualWeight: 0.25 }
  }
};