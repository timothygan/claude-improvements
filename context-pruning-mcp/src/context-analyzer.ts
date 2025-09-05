/**
 * Context Analyzer - Intelligent message importance scoring and conversation analysis
 * Implements dynamic token pruning inspired by LazyLLM research
 */

import type {
  ConversationContext,
  ConversationMessage,
  ImportanceScore,
  AnalysisResult,
  MessageType,
  PruningStrategy,
  ScoringProfile,
  ScoreBreakdown,
} from './types.js';
import { DEFAULT_STRATEGIES, DEFAULT_SCORING_PROFILES } from './types.js';
import { BM25Scorer } from './services/bm25-scorer.js';
import { SemanticScorer } from './services/semantic-scorer.js';
import { CoherenceScorer } from './services/coherence-scorer.js';
import { ToolResultAnalyzer } from './services/tool-result-analyzer.js';
import { SystemContextAnalyzer } from './services/system-context-analyzer.js';

export class ContextAnalyzer {
  private readonly RECENCY_DECAY_FACTOR = 0.95;
  private bm25Scorer: BM25Scorer;
  private readonly semanticScorer: SemanticScorer;
  private readonly coherenceScorer: CoherenceScorer;
  private readonly toolResultAnalyzer: ToolResultAnalyzer;
  private readonly systemContextAnalyzer: SystemContextAnalyzer;
  private currentProfile: ScoringProfile;
  
  private readonly LEGACY_SEMANTIC_KEYWORDS = new Set([
    'error',
    'bug',
    'fix',
    'implement',
    'create',
    'update',
    'delete',
    'refactor',
    'test',
    'deploy',
    'config',
    'install',
    'import',
    'export',
    'function',
    'class',
    'method',
    'variable',
    'constant',
    'interface',
    'type',
  ]);

  private readonly LEGACY_TYPE_WEIGHTS: Record<MessageType, number> = {
    error: 1.0,
    code_change: 0.9,
    file_operation: 0.8,
    tool_use: 0.7,
    query: 0.6,
    success: 0.4,
    summary: 0.3,
  };

  constructor(profile?: ScoringProfile) {
    const defaultProfile = DEFAULT_SCORING_PROFILES.technical;
    if (!defaultProfile) {
      throw new Error('Default technical profile not found');
    }
    this.currentProfile = profile ?? defaultProfile;
    this.bm25Scorer = new BM25Scorer(this.currentProfile.bm25Parameters);
    this.semanticScorer = new SemanticScorer();
    this.coherenceScorer = new CoherenceScorer();
    this.toolResultAnalyzer = new ToolResultAnalyzer();
    this.systemContextAnalyzer = new SystemContextAnalyzer();
  }

  /**
   * Analyze conversation context and provide optimization insights with enhanced token tracking
   */
  async analyze(context: ConversationContext): Promise<AnalysisResult> {
    const scoredMessages = await this.scoreMessages(context);
    const redundancyScore = this.calculateRedundancy(scoredMessages);
    const averageImportance = this.calculateAverageImportance(scoredMessages);

    // Enhanced context analysis including system context and tool results
    const enhancedTokens = await this.calculateEnhancedTokenCount(context);
    
    const recommendedStrategy = this.recommendStrategy(
      enhancedTokens.totalTokens,
      averageImportance,
      redundancyScore
    );

    const estimatedReduction = this.estimateReduction(
      context,
      recommendedStrategy
    );

    return {
      totalMessages: context.messages.length,
      totalTokens: enhancedTokens.totalTokens,
      averageImportance,
      redundancyScore,
      recommendedStrategy,
      estimatedReduction,
    };
  }

  /**
   * Calculate enhanced token count including system context and tool results
   */
  private async calculateEnhancedTokenCount(context: ConversationContext): Promise<{
    totalTokens: number;
    messageTokens: number;
    systemTokens: number;
    toolResultTokens: number;
    breakdown: string[];
  }> {
    // Basic message tokens
    const messageTokens = context.messages.reduce((sum, msg) => 
      sum + msg.metadata.tokenCount, 0);

    let systemTokens = 0;
    let toolResultTokens = 0;
    const breakdown: string[] = [];

    // Analyze system context if available
    if (context.systemContext) {
      const systemAnalysis = this.systemContextAnalyzer.analyzeSystemContext(context.systemContext);
      systemTokens = systemAnalysis.tokenBreakdown.systemTokens;
      
      breakdown.push(
        `System Context: ${systemTokens} tokens`,
        `- CLAUDE.md: ${this.estimateTokens(context.systemContext.claudeMdContent)} tokens`,
        `- Environment: ${Object.keys(context.systemContext.environmentVariables).length} variables`,
        `- Tool Permissions: ${context.systemContext.toolPermissions.length} rules`
      );
    }

    // Analyze tool results if available
    if (context.toolResultHistory) {
      const toolAnalysis = this.toolResultAnalyzer.analyzeToolResults(
        [...context.toolResultHistory]
      );
      toolResultTokens = toolAnalysis.tokenBreakdown.toolResultTokens;
      
      breakdown.push(
        `Tool Results: ${toolResultTokens} tokens`,
        `- File Reads: ${context.toolResultHistory.filter(r => r.resultType === 'file_read').length} files`,
        `- Commands: ${context.toolResultHistory.filter(r => r.resultType === 'command_output').length} executions`,
        `- Searches: ${context.toolResultHistory.filter(r => r.resultType === 'search_results').length} operations`
      );

      // Add optimization suggestions to breakdown
      if (toolAnalysis.optimizationSuggestions.length > 0) {
        breakdown.push('Optimization Opportunities:');
        toolAnalysis.optimizationSuggestions.forEach(suggestion => 
          breakdown.push(`- ${suggestion}`)
        );
      }
    }

    const totalTokens = messageTokens + systemTokens + toolResultTokens;

    return {
      totalTokens,
      messageTokens,
      systemTokens,
      toolResultTokens,
      breakdown
    };
  }

  /**
   * Score all messages in the conversation for importance
   */
  async scoreMessages(
    context: ConversationContext
  ): Promise<ConversationMessage[]> {
    const now = Date.now();
    const referenceMap = this.buildReferenceMap(context.messages);

    const scoredMessages = context.messages.map((message, index) => {
      const importance = this.calculateImportanceScore(
        message,
        index,
        context.messages.length,
        now,
        referenceMap,
        context.activeFiles,
        context.messages
      );

      return {
        ...message,
        metadata: {
          ...message.metadata,
          importance,
        },
      };
    });

    return scoredMessages;
  }

  /**
   * Set the scoring profile for importance calculation
   */
  setScoringProfile(profile: ScoringProfile): void {
    this.currentProfile = profile;
    // Update BM25 parameters
    this.bm25Scorer = new BM25Scorer(profile.bm25Parameters);
  }

  /**
   * Get the current scoring profile
   */
  getScoringProfile(): ScoringProfile {
    return this.currentProfile;
  }

  /**
   * Calculate comprehensive importance score for a message using hybrid approach
   */
  private calculateImportanceScore(
    message: ConversationMessage,
    index: number,
    _totalMessages: number,
    currentTime: number,
    referenceMap: Map<string, number>,
    activeFiles: readonly string[],
    allMessages: readonly ConversationMessage[]
  ): ImportanceScore {
    const recency = this.calculateRecencyScore(message.timestamp, currentTime);
    const semantic = this.calculateHybridSemanticScore(message, allMessages);
    const references = this.calculateReferenceScore(message.id, referenceMap);
    const fileRelevance = this.calculateFileRelevanceScore(message, activeFiles);
    const coherence = this.calculateCoherenceScore(message, index, allMessages);

    const weights = this.currentProfile.weights;
    const total = (
      recency * weights.recency +
      semantic * weights.semantic +
      references * weights.references +
      fileRelevance * weights.fileRelevance +
      coherence * weights.coherence
    );

    // Calculate detailed breakdown for analysis
    const breakdown = this.calculateScoreBreakdown(message, index, allMessages);

    return {
      total,
      recency,
      semantic,
      references,
      fileRelevance,
      coherence,
      computed: currentTime,
      breakdown,
    };
  }

  /**
   * Calculate recency score with exponential decay
   */
  private calculateRecencyScore(
    messageTime: number,
    currentTime: number
  ): number {
    const ageInMinutes = (currentTime - messageTime) / (1000 * 60);
    return Math.pow(this.RECENCY_DECAY_FACTOR, ageInMinutes);
  }

  /**
   * Calculate hybrid semantic score combining BM25, transformers, and contextual analysis
   */
  private calculateHybridSemanticScore(
    message: ConversationMessage,
    allMessages: readonly ConversationMessage[]
  ): number {
    const messageIndex = allMessages.findIndex(m => m.id === message.id);
    if (messageIndex === -1) return this.calculateLegacySemanticScore(message);

    // BM25 component - lexical matching against conversation corpus
    const bm25Score = this.calculateBM25Score(message, messageIndex, allMessages);
    
    // Semantic transformer component - semantic understanding
    const transformerScore = this.calculateTransformerScore(message, allMessages);
    
    // Contextual component - domain and conversation context
    const contextualScore = this.calculateContextualScore(message, allMessages);
    
    // Combine using profile weights
    const hybridConfig = this.currentProfile.hybridScoring;
    const hybridScore = (
      bm25Score * hybridConfig.bm25Weight +
      transformerScore * hybridConfig.transformerWeight +
      contextualScore * hybridConfig.contextualWeight
    );

    return Math.min(1.0, hybridScore);
  }

  /**
   * Legacy semantic scoring for backwards compatibility
   */
  private calculateLegacySemanticScore(message: ConversationMessage): number {
    let score = this.LEGACY_TYPE_WEIGHTS[message.type] ?? 0.5;

    const content = message.content.toLowerCase();
    let keywordCount = 0;
    let totalWords = content.split(/\s+/).length;

    for (const keyword of this.LEGACY_SEMANTIC_KEYWORDS) {
      if (content.includes(keyword)) {
        keywordCount++;
      }
    }

    if (totalWords > 0) {
      score += (keywordCount / totalWords) * 0.5;
    }

    if (message.metadata.hasError) {
      score += 0.3;
    }

    if (message.metadata.codeBlocks.length > 0) {
      score += 0.2;
    }

    if (message.metadata.toolsUsed.length > 0) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }


  /**
   * Calculate reference score based on how often the message is referenced
   */
  private calculateReferenceScore(
    messageId: string,
    referenceMap: Map<string, number>
  ): number {
    const references = referenceMap.get(messageId) ?? 0;
    return Math.min(references * 0.1, 1.0);
  }

  /**
   * Calculate file relevance score based on active files
   */
  private calculateFileRelevanceScore(
    message: ConversationMessage,
    activeFiles: readonly string[]
  ): number {
    if (activeFiles.length === 0) return 0.5;

    const messageFiles = new Set(message.metadata.fileReferences);
    const activeFileSet = new Set(activeFiles);

    let relevantFiles = 0;
    for (const file of messageFiles) {
      if (activeFileSet.has(file)) {
        relevantFiles++;
      }
    }

    return messageFiles.size > 0 ? relevantFiles / messageFiles.size : 0.3;
  }

  /**
   * Build a map of message references for cross-referencing analysis
   */
  private buildReferenceMap(
    messages: readonly ConversationMessage[]
  ): Map<string, number> {
    const referenceMap = new Map<string, number>();

    for (const message of messages) {
      const messageIds = this.extractMessageReferences(message.content);
      for (const id of messageIds) {
        referenceMap.set(id, (referenceMap.get(id) ?? 0) + 1);
      }
    }

    return referenceMap;
  }

  /**
   * Extract message ID references from content
   */
  private extractMessageReferences(content: string): string[] {
    const idPattern = /msg_[a-zA-Z0-9]+/g;
    return content.match(idPattern) ?? [];
  }

  /**
   * Calculate conversation redundancy score
   */
  private calculateRedundancy(messages: ConversationMessage[]): number {
    if (messages.length < 2) return 0;

    const contentSimilarity = this.calculateContentSimilarity(messages);
    const patternRepetition = this.calculatePatternRepetition(messages);

    return (contentSimilarity + patternRepetition) / 2;
  }

  /**
   * Calculate content similarity between messages
   */
  private calculateContentSimilarity(messages: ConversationMessage[]): number {
    const uniqueContents = new Set<string>();
    let duplicateCount = 0;

    for (const message of messages) {
      const normalizedContent = this.normalizeContent(message.content);
      if (uniqueContents.has(normalizedContent)) {
        duplicateCount++;
      } else {
        uniqueContents.add(normalizedContent);
      }
    }

    return messages.length > 0 ? duplicateCount / messages.length : 0;
  }

  /**
   * Calculate pattern repetition in message types
   */
  private calculatePatternRepetition(messages: ConversationMessage[]): number {
    const patterns: string[] = [];
    let repetitions = 0;

    for (let i = 0; i < messages.length - 2; i++) {
      const pattern = `${messages[i]?.type}-${messages[i + 1]?.type}-${messages[i + 2]?.type}`;
      if (patterns.includes(pattern)) {
        repetitions++;
      }
      patterns.push(pattern);
    }

    return patterns.length > 0 ? repetitions / patterns.length : 0;
  }

  /**
   * Normalize content for similarity comparison
   */
  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Calculate average importance score across all messages
   */
  private calculateAverageImportance(messages: ConversationMessage[]): number {
    if (messages.length === 0) return 0;

    const totalImportance = messages.reduce(
      (sum, message) => sum + (message.metadata.importance?.total ?? 0),
      0
    );

    return totalImportance / messages.length;
  }

  /**
   * Recommend optimal pruning strategy based on conversation characteristics
   */
  private recommendStrategy(
    totalTokens: number,
    averageImportance: number,
    redundancyScore: number
  ): PruningStrategy['name'] {
    if (totalTokens > 150000 || redundancyScore > 0.4) {
      return 'aggressive';
    }

    if (totalTokens > 100000 || averageImportance < 0.4) {
      return 'balanced';
    }

    return 'conservative';
  }

  /**
   * Estimate potential token reduction for a given strategy
   */
  private estimateReduction(
    context: ConversationContext,
    strategy: PruningStrategy['name']
  ): number {
    const strategyConfig = DEFAULT_STRATEGIES[strategy];
    const currentTokens = context.totalTokens;

    if (currentTokens <= strategyConfig.maxTokens) {
      return 0;
    }

    const targetTokens = strategyConfig.maxTokens;
    const reductionNeeded = currentTokens - targetTokens;

    return (reductionNeeded / currentTokens) * 100;
  }

  /**
   * Calculate BM25 score for lexical matching
   */
  private calculateBM25Score(
    _message: ConversationMessage,
    messageIndex: number,
    allMessages: readonly ConversationMessage[]
  ): number {
    // Create query from profile keywords and message context
    const profileKeywords = this.currentProfile.semanticKeywords.join(' ');
    const contextMessages = this.getRecentContext(messageIndex, allMessages, 3);
    const contextQuery = contextMessages.map(m => m.content).join(' ');
    const combinedQuery = `${profileKeywords} ${contextQuery}`.trim();

    if (combinedQuery.length === 0) return 0.5;

    const score = this.bm25Scorer.calculateScore(combinedQuery, messageIndex);
    
    // Normalize score to 0-1 range (BM25 can have varying ranges)
    return Math.min(1.0, score / 10); // Assume max reasonable BM25 score is ~10
  }

  /**
   * Calculate transformer-based semantic score
   */
  private calculateTransformerScore(
    message: ConversationMessage,
    _allMessages: readonly ConversationMessage[]
  ): number {
    // Use semantic scorer for semantic understanding
    const semanticDensity = this.semanticScorer.calculateSemanticDensity(message.content);
    
    // Domain relevance based on profile keywords
    const domainRelevance = this.semanticScorer.calculateDomainRelevance(
      message.content,
      this.currentProfile.semanticKeywords
    );

    // Type-based scoring using profile weights
    const typeScore = this.currentProfile.typeWeights[message.type] ?? 0.5;

    // Content bonuses
    let bonusScore = 0;
    if (message.metadata.hasError) bonusScore += 0.25;
    if (message.metadata.codeBlocks.length > 0) bonusScore += 0.2;
    if (message.metadata.toolsUsed.length > 0) bonusScore += 0.15;

    return Math.min(1.0, 
      semanticDensity * 0.3 +
      domainRelevance * 0.3 +
      typeScore * 0.3 +
      bonusScore * 0.1
    );
  }

  /**
   * Calculate contextual score based on conversation flow and domain
   */
  private calculateContextualScore(
    message: ConversationMessage,
    allMessages: readonly ConversationMessage[]
  ): number {
    const messageIndex = allMessages.findIndex(m => m.id === message.id);
    if (messageIndex === -1) return 0.5;

    const contextMessages = this.getRecentContext(messageIndex, allMessages, 5);
    const contextTexts = contextMessages
      .filter(m => m.id !== message.id)
      .map(m => m.content);

    if (contextTexts.length === 0) return 0.5;

    // Calculate contextual importance using semantic scorer
    const contextualImportance = this.semanticScorer.calculateContextualImportance(
      message.content,
      contextTexts
    );

    return contextualImportance;
  }

  /**
   * Calculate coherence score using coherence scorer
   */
  private calculateCoherenceScore(
    message: ConversationMessage,
    messageIndex: number,
    allMessages: readonly ConversationMessage[]
  ): number {
    return this.coherenceScorer.calculateCoherenceScore(message, messageIndex, allMessages);
  }

  /**
   * Calculate detailed score breakdown for analysis
   */
  private calculateScoreBreakdown(
    message: ConversationMessage,
    messageIndex: number,
    allMessages: readonly ConversationMessage[]
  ): ScoreBreakdown {
    const bm25Score = this.calculateBM25Score(message, messageIndex, allMessages);
    const transformerScore = this.calculateTransformerScore(message, allMessages);
    const contextualScore = this.calculateContextualScore(message, allMessages);
    
    const coherenceMetrics = this.coherenceScorer.calculateCoherenceMetrics(
      message, messageIndex, allMessages
    );

    return {
      bm25Score,
      transformerScore,
      contextualScore,
      threadContinuity: coherenceMetrics.threadContinuity,
      referenceChainStrength: coherenceMetrics.referenceChainStrength,
      informationDensity: coherenceMetrics.informationDensity
    };
  }

  /**
   * Get recent context messages around a given index
   */
  private getRecentContext(
    messageIndex: number,
    allMessages: readonly ConversationMessage[],
    windowSize: number
  ): ConversationMessage[] {
    const start = Math.max(0, messageIndex - windowSize);
    const end = Math.min(allMessages.length, messageIndex + windowSize + 1);
    return allMessages.slice(start, end) as ConversationMessage[];
  }

  /**
   * Analyze conversation using enhanced scoring system
   */
  async analyzeEnhanced(context: ConversationContext): Promise<AnalysisResult & {
    coherenceAnalysis: {
      averageCoherence: number;
      topicShifts: number;
      isolatedMessages: string[];
    };
    profileRecommendation: string;
  }> {
    const basicAnalysis = await this.analyze(context);
    
    // Enhanced coherence analysis
    const coherenceAnalysis = this.coherenceScorer.analyzeConversationFlow(context.messages);
    
    // Profile recommendation based on content analysis
    const profileRecommendation = this.recommendScoringProfile(context);
    
    return {
      ...basicAnalysis,
      coherenceAnalysis: {
        averageCoherence: coherenceAnalysis.averageCoherence,
        topicShifts: coherenceAnalysis.topicShifts,
        isolatedMessages: coherenceAnalysis.isolatedMessages
      },
      profileRecommendation
    };
  }

  /**
   * Recommend the best scoring profile for the conversation
   */
  private recommendScoringProfile(context: ConversationContext): string {
    const messageTypes = context.messages.map(m => m.type);
    const hasErrors = messageTypes.includes('error');
    const hasCodeChanges = messageTypes.includes('code_change');
    const hasFileOps = messageTypes.includes('file_operation');
    const hasToolUse = messageTypes.includes('tool_use');
    
    const technicalScore = (hasErrors ? 3 : 0) + (hasCodeChanges ? 2 : 0) + (hasFileOps ? 2 : 0) + (hasToolUse ? 1 : 0);
    
    // Check for creative keywords in content
    const allContent = context.messages.map(m => m.content.toLowerCase()).join(' ');
    const creativeKeywords = ['design', 'creative', 'idea', 'concept', 'brainstorm', 'explore'];
    const creativeScore = creativeKeywords.filter(kw => allContent.includes(kw)).length;
    
    // Check for problem-solving keywords
    const problemKeywords = ['problem', 'solution', 'issue', 'fix', 'debug', 'troubleshoot', 'analyze'];
    const problemScore = problemKeywords.filter(kw => allContent.includes(kw)).length;
    
    if (technicalScore >= 4) return 'technical';
    if (problemScore >= 3) return 'problemSolving';
    if (creativeScore >= 2) return 'creative';
    
    return 'technical'; // Default fallback
  }

  /**
   * Add a tool result to the analyzer for tracking
   */
  addToolResult(toolResult: Partial<import('./types.js').ToolResultContext>): void {
    this.toolResultAnalyzer.addToolResult(toolResult);
  }

  /**
   * Get detailed context breakdown including all components
   */
  async getDetailedContextBreakdown(context: ConversationContext): Promise<{
    messageAnalysis: any;
    systemAnalysis?: any;
    toolResultAnalysis?: any;
    enhancedTokens: any;
    recommendations: string[];
  }> {
    const scoredMessages = await this.scoreMessages(context);
    const enhancedTokens = await this.calculateEnhancedTokenCount(context);
    
    let systemAnalysis;
    if (context.systemContext) {
      systemAnalysis = this.systemContextAnalyzer.analyzeSystemContext(context.systemContext);
    }

    let toolResultAnalysis;
    if (context.toolResultHistory) {
      toolResultAnalysis = this.toolResultAnalyzer.analyzeToolResults([...context.toolResultHistory]);
    }

    const recommendations: string[] = [];
    
    // Add system context recommendations
    if (systemAnalysis?.optimizationSuggestions) {
      recommendations.push('System Context Optimizations:');
      systemAnalysis.optimizationSuggestions.forEach((suggestion: string) => 
        recommendations.push(`- ${suggestion}`)
      );
    }

    // Add tool result recommendations
    if (toolResultAnalysis?.optimizationSuggestions) {
      recommendations.push('Tool Result Optimizations:');
      toolResultAnalysis.optimizationSuggestions.forEach((suggestion: string) => 
        recommendations.push(`- ${suggestion}`)
      );
    }

    return {
      messageAnalysis: {
        totalMessages: scoredMessages.length,
        averageImportance: this.calculateAverageImportance(scoredMessages),
        redundancyScore: this.calculateRedundancy(scoredMessages)
      },
      systemAnalysis,
      toolResultAnalysis,
      enhancedTokens,
      recommendations
    };
  }

  /**
   * Estimate token count for text content (improved version)
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    
    // Enhanced token estimation accounting for different content types
    const baseEstimate = Math.ceil(text.length / 4);
    
    // Add overhead for structured content
    const lines = text.split('\n').length;
    const codeBlocks = (text.match(/```/g) || []).length / 2;
    const jsonStructures = (text.match(/[{}[\]]/g) || []).length;
    const markdownElements = (text.match(/[*_`#]/g) || []).length;
    
    return baseEstimate + 
           Math.ceil(lines * 0.1) + 
           Math.ceil(codeBlocks * 10) + 
           Math.ceil(jsonStructures * 0.2) +
           Math.ceil(markdownElements * 0.05);
  }
}