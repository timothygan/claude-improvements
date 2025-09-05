/**
 * Pruning Engine - Dynamic context pruning with rollback capability
 * Implements selective content removal while preserving conversation coherence
 */

import type {
  ConversationContext,
  ConversationMessage,
  PruningStrategy,
  PruningResult,
  RollbackData,
  ScoringProfile,
  SystemContext,
  ToolResultContext,
} from './types.js';
import { ContextAnalyzer } from './context-analyzer.js';
import { Summarizer } from './summarizer.js';
import { ToolResultAnalyzer } from './services/tool-result-analyzer.js';
import { SystemContextAnalyzer } from './services/system-context-analyzer.js';

export class PruningEngine {
  private readonly contextAnalyzer: ContextAnalyzer;
  private readonly summarizer: Summarizer;
  private readonly toolResultAnalyzer: ToolResultAnalyzer;
  private readonly systemContextAnalyzer: SystemContextAnalyzer;
  private readonly rollbackHistory = new Map<string, RollbackData>();
  private readonly MAX_ROLLBACK_HISTORY = 5;

  constructor(scoringProfile?: ScoringProfile) {
    this.contextAnalyzer = new ContextAnalyzer(scoringProfile);
    this.summarizer = new Summarizer();
    this.toolResultAnalyzer = new ToolResultAnalyzer();
    this.systemContextAnalyzer = new SystemContextAnalyzer();
  }

  /**
   * Update the scoring profile used by the context analyzer
   */
  setScoringProfile(profile: ScoringProfile): void {
    this.contextAnalyzer.setScoringProfile(profile);
  }

  /**
   * Get the current scoring profile
   */
  getScoringProfile(): ScoringProfile {
    return this.contextAnalyzer.getScoringProfile();
  }

  /**
   * Prune conversation context according to the specified strategy with enhanced context handling
   */
  async prune(
    context: ConversationContext,
    strategy: PruningStrategy
  ): Promise<PruningResult> {
    const pruningId = this.generatePruningId();
    
    // Calculate enhanced token counts including system context and tool results
    const enhancedAnalysis = await this.contextAnalyzer.getDetailedContextBreakdown(context);
    const originalTokens = enhancedAnalysis.enhancedTokens.totalTokens;

    // Prune messages using existing logic
    const scoredMessages = await this.contextAnalyzer.scoreMessages(context);
    const { preserved, toRemove, toSummarize } = this.categorizeMessages(
      scoredMessages,
      strategy
    );

    // Enhanced pruning: also handle system context and tool results
    const { optimizedSystemContext } = await this.pruneSystemContext(
      context.systemContext,
      strategy
    );
    
    const { optimizedToolResults } = await this.pruneToolResults(
      context.toolResultHistory,
      strategy
    );

    // Create summaries for messages
    const summariesCreated = await this.summarizer.createSummaries(
      { ...context, messages: toSummarize },
      'session'
    );

    const rollbackData: RollbackData = {
      pruningId,
      removedMessages: toRemove,
      originalOrder: context.messages.map(m => m.id),
      timestamp: Date.now(),
    };

    this.storeRollbackData(pruningId, rollbackData);

    // Calculate final tokens including all components
    const finalMessageTokens = this.calculateTotalTokens([
      ...preserved, 
      ...this.summariesToMessages(summariesCreated)
    ]);
    const finalSystemTokens = optimizedSystemContext?.totalTokens || 0;
    const finalToolResultTokens = optimizedToolResults.reduce(
      (sum, result) => sum + result.inputTokens + result.outputTokens, 0
    );
    const finalTokens = finalMessageTokens + finalSystemTokens + finalToolResultTokens;

    return {
      originalTokens,
      finalTokens,
      reductionPercent: ((originalTokens - finalTokens) / originalTokens) * 100,
      messagesRemoved: toRemove.length,
      messagesSummarized: toSummarize.length,
      summariesCreated,
      rollbackData,
    };
  }

  /**
   * Prune system context components
   */
  private async pruneSystemContext(
    systemContext?: SystemContext,
    strategy?: PruningStrategy
  ): Promise<{
    optimizedSystemContext?: SystemContext;
    systemTokensSaved: number;
  }> {
    if (!systemContext) {
      return { systemTokensSaved: 0 };
    }

    const originalTokens = systemContext.totalTokens;
    
    // Optimize CLAUDE.md content
    const claudeMdOptimization = this.systemContextAnalyzer.optimizeClaudeMdContent(
      systemContext.claudeMdContent
    );

    // Filter environment variables based on strategy aggressiveness
    const filteredEnvVars = this.filterEnvironmentVariables(
      systemContext.environmentVariables,
      strategy
    );

    const optimizedSystemContext: SystemContext = {
      ...systemContext,
      claudeMdContent: claudeMdOptimization.optimizedContent,
      environmentVariables: filteredEnvVars,
      totalTokens: this.calculateSystemContextTokens({
        ...systemContext,
        claudeMdContent: claudeMdOptimization.optimizedContent,
        environmentVariables: filteredEnvVars,
      }),
    };

    const systemTokensSaved = originalTokens - optimizedSystemContext.totalTokens;

    return {
      optimizedSystemContext,
      systemTokensSaved,
    };
  }

  /**
   * Prune tool results based on strategy
   */
  private async pruneToolResults(
    toolResults?: readonly ToolResultContext[],
    strategy?: PruningStrategy
  ): Promise<{
    optimizedToolResults: ToolResultContext[];
    toolResultTokensSaved: number;
  }> {
    if (!toolResults || toolResults.length === 0) {
      return { optimizedToolResults: [], toolResultTokensSaved: 0 };
    }

    const mutableToolResults = [...toolResults];
    const analysis = this.toolResultAnalyzer.analyzeToolResults(mutableToolResults);
    const originalTokens = analysis.tokenBreakdown.toolResultTokens;

    let optimizedToolResults = [...mutableToolResults];

    // Remove duplicate results
    if (analysis.duplicates.length > 0) {
      const duplicateIds = new Set();
      analysis.duplicates.forEach(group => {
        // Keep the most recent result from each duplicate group
        group.sort((a, b) => b.timestamp - a.timestamp);
        group.slice(1).forEach(result => duplicateIds.add(result.executionId));
      });
      
      optimizedToolResults = optimizedToolResults.filter(
        result => !duplicateIds.has(result.executionId)
      );
    }

    // Remove stale results based on strategy aggressiveness
    if (strategy && ['balanced', 'aggressive'].includes(strategy.name)) {
      optimizedToolResults = optimizedToolResults.filter(result => {
        // Keep recent results
        const ageInMinutes = (Date.now() - result.timestamp) / (1000 * 60);
        
        if (strategy.name === 'aggressive') {
          return ageInMinutes < 15; // Keep only last 15 minutes
        } else if (strategy.name === 'balanced') {
          return ageInMinutes < 30; // Keep last 30 minutes
        }
        
        return true; // Conservative keeps everything
      });
    }

    // For aggressive pruning, also remove low-relevance results
    if (strategy?.name === 'aggressive') {
      optimizedToolResults = optimizedToolResults.filter(
        result => result.relevanceScore > 0.3
      );
    }

    const finalTokens = optimizedToolResults.reduce(
      (sum, result) => sum + result.inputTokens + result.outputTokens, 0
    );
    const toolResultTokensSaved = originalTokens - finalTokens;

    return {
      optimizedToolResults,
      toolResultTokensSaved,
    };
  }

  /**
   * Categorize messages into preserve, remove, or summarize buckets
   */
  private categorizeMessages(
    messages: ConversationMessage[],
    strategy: PruningStrategy
  ): {
    preserved: ConversationMessage[];
    toRemove: ConversationMessage[];
    toSummarize: ConversationMessage[];
  } {
    const preserved: ConversationMessage[] = [];
    const toRemove: ConversationMessage[] = [];
    const toSummarize: ConversationMessage[] = [];

    let currentTokens = 0;
    const maxTokens = strategy.maxTokens;

    const sortedMessages = [...messages].sort((a, b) => {
      const aImportance = a.metadata.importance?.total ?? 0;
      const bImportance = b.metadata.importance?.total ?? 0;
      return bImportance - aImportance;
    });

    for (const message of sortedMessages) {
      const shouldAlwaysPreserve = strategy.alwaysPreserve.includes(message.type);
      const isHighImportance = (message.metadata.importance?.total ?? 0) >= strategy.importanceThreshold;
      const wouldFitInBudget = currentTokens + message.metadata.tokenCount <= maxTokens;

      if (shouldAlwaysPreserve || (isHighImportance && wouldFitInBudget)) {
        preserved.push(message);
        currentTokens += message.metadata.tokenCount;
      } else if (this.isSummarizable(message)) {
        toSummarize.push(message);
      } else {
        toRemove.push(message);
      }
    }

    if (currentTokens > maxTokens * strategy.preserveRatio) {
      const excess = preserved.splice(
        Math.floor(preserved.length * strategy.preserveRatio)
      );
      toSummarize.push(...excess.filter(msg => this.isSummarizable(msg)));
      toRemove.push(...excess.filter(msg => !this.isSummarizable(msg)));
    }

    const summaryBudget = maxTokens * strategy.summaryRatio;
    const summarizable = toSummarize.sort((a, b) => {
      const aImportance = a.metadata.importance?.total ?? 0;
      const bImportance = b.metadata.importance?.total ?? 0;
      return bImportance - aImportance;
    });

    let summaryTokens = 0;
    const finalSummarizable: ConversationMessage[] = [];

    for (const message of summarizable) {
      if (summaryTokens + message.metadata.tokenCount <= summaryBudget) {
        finalSummarizable.push(message);
        summaryTokens += message.metadata.tokenCount;
      } else {
        toRemove.push(message);
      }
    }

    return {
      preserved: this.restoreOriginalOrder(preserved, messages),
      toRemove: this.restoreOriginalOrder(toRemove, messages),
      toSummarize: this.restoreOriginalOrder(finalSummarizable, messages),
    };
  }

  /**
   * Check if a message can be meaningfully summarized
   */
  private isSummarizable(message: ConversationMessage): boolean {
    if (message.metadata.tokenCount < 50) return false;
    if (message.type === 'error') return false;
    if (message.metadata.codeBlocks.length > 0) return true;
    if (message.content.length > 200) return true;
    return false;
  }

  /**
   * Restore original chronological order of messages
   */
  private restoreOriginalOrder(
    messages: ConversationMessage[],
    originalOrder: ConversationMessage[]
  ): ConversationMessage[] {
    const orderMap = new Map(originalOrder.map((msg, idx) => [msg.id, idx]));
    return messages.sort((a, b) => {
      const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
  }

  /**
   * Convert summary objects to conversation messages
   */
  private summariesToMessages(summaries: any[]): ConversationMessage[] {
    return summaries.map(summary => ({
      id: summary.id,
      timestamp: summary.timestamp,
      type: 'summary' as const,
      role: 'assistant' as const,
      content: `[SUMMARY] ${summary.content}`,
      metadata: {
        tokenCount: this.estimateTokens(summary.content),
        fileReferences: [],
        codeBlocks: [],
        hasError: false,
        toolsUsed: [],
        importance: {
          total: 0.8,
          recency: 0.9,
          semantic: 0.8,
          references: 0.7,
          fileRelevance: 0.6,
          computed: Date.now(),
        },
      },
    }));
  }

  /**
   * Calculate total tokens for a list of messages
   */
  private calculateTotalTokens(messages: ConversationMessage[]): number {
    return messages.reduce((total, msg) => total + msg.metadata.tokenCount, 0);
  }

  /**
   * Estimate token count for text content
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Generate unique pruning operation ID
   */
  private generatePruningId(): string {
    return `prune_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store rollback data with history management
   */
  private storeRollbackData(id: string, data: RollbackData): void {
    this.rollbackHistory.set(id, data);

    if (this.rollbackHistory.size > this.MAX_ROLLBACK_HISTORY) {
      const oldestKey = Array.from(this.rollbackHistory.keys())[0];
      if (oldestKey) {
        this.rollbackHistory.delete(oldestKey);
      }
    }
  }

  /**
   * Rollback a pruning operation by ID
   */
  async rollback(pruningId: string): Promise<boolean> {
    const rollbackData = this.rollbackHistory.get(pruningId);
    if (!rollbackData) {
      return false;
    }

    this.rollbackHistory.delete(pruningId);
    return true;
  }

  /**
   * Get available rollback operations
   */
  getAvailableRollbacks(): RollbackData[] {
    return Array.from(this.rollbackHistory.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /**
   * Clear all rollback history
   */
  clearRollbackHistory(): void {
    this.rollbackHistory.clear();
  }

  /**
   * Helper method to filter environment variables based on strategy
   */
  private filterEnvironmentVariables(
    envVars: Record<string, string>,
    strategy?: PruningStrategy
  ): Record<string, string> {
    if (!strategy) return envVars;

    const essentialVars = new Set([
      'PATH', 'HOME', 'USER', 'PWD', 'SHELL', 'TERM',
      'NODE_ENV', 'NODE_PATH', 'NPM_TOKEN',
      'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL',
      'CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'
    ]);

    const entries = Object.entries(envVars);

    switch (strategy.name) {
      case 'aggressive':
        // Keep only essential variables
        return Object.fromEntries(
          entries.filter(([key]) => essentialVars.has(key))
        );
      
      case 'balanced':
        // Keep essential vars + any with short values
        return Object.fromEntries(
          entries.filter(([key, value]) => 
            essentialVars.has(key) || value.length < 100
          )
        );
      
      case 'conservative':
      default:
        // Keep all environment variables
        return envVars;
    }
  }

  /**
   * Calculate total tokens for system context
   */
  private calculateSystemContextTokens(systemContext: SystemContext): number {
    const systemInstructionTokens = this.estimateTokens(systemContext.systemInstructions);
    const claudeMdTokens = this.estimateTokens(systemContext.claudeMdContent);
    const claudeLocalMdTokens = systemContext.claudeLocalMdContent ? 
      this.estimateTokens(systemContext.claudeLocalMdContent) : 0;
    const envVarTokens = this.estimateTokens(
      Object.entries(systemContext.environmentVariables)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')
    );
    const permissionTokens = this.estimateTokens(
      JSON.stringify(systemContext.toolPermissions, null, 2)
    );
    const gitStatusTokens = systemContext.gitStatus ? 
      this.estimateTokens(systemContext.gitStatus) : 0;

    return systemInstructionTokens + claudeMdTokens + claudeLocalMdTokens + 
           envVarTokens + permissionTokens + gitStatusTokens;
  }
}