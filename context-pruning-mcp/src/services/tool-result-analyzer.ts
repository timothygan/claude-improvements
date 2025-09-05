/**
 * Tool Result Analyzer - Analyzes and manages tool results for context optimization
 * Handles file reads, command outputs, search results, and MCP responses
 */

import crypto from 'crypto';
import type {
  ToolResultContext,
  ContextTokenBreakdown,
  TokenCategoryBreakdown
} from '../types.js';

export class ToolResultAnalyzer {
  private readonly STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  private readonly DUPLICATE_SIMILARITY_THRESHOLD = 0.95;
  private readonly toolResultCache = new Map<string, ToolResultContext>();
  private readonly contentHashIndex = new Map<string, string[]>();

  /**
   * Add a new tool result to the analysis system
   */
  addToolResult(toolResult: Partial<ToolResultContext>): ToolResultContext {
    const fullResult: ToolResultContext = {
      toolName: toolResult.toolName || 'unknown',
      executionId: toolResult.executionId || this.generateExecutionId(),
      timestamp: toolResult.timestamp || Date.now(),
      inputTokens: toolResult.inputTokens || 0,
      outputTokens: toolResult.outputTokens || this.estimateTokens(toolResult.content || ''),
      resultType: toolResult.resultType || 'system_info',
      content: toolResult.content || '',
      filePath: toolResult.filePath || undefined,
      relevanceScore: toolResult.relevanceScore || 0.5,
      accessFrequency: toolResult.accessFrequency || 1,
      lastAccessed: toolResult.lastAccessed || Date.now(),
      contentHash: toolResult.contentHash || this.generateContentHash(toolResult.content || ''),
      isStale: toolResult.isStale || false
    };

    this.toolResultCache.set(fullResult.executionId, fullResult);
    this.indexContentHash(fullResult.contentHash, fullResult.executionId);
    
    return fullResult;
  }

  /**
   * Analyze tool results and identify optimization opportunities
   */
  analyzeToolResults(toolResults: ToolResultContext[]): {
    duplicates: ToolResultContext[][];
    staleResults: ToolResultContext[];
    tokenBreakdown: ContextTokenBreakdown;
    optimizationSuggestions: string[];
  } {
    const duplicates = this.findDuplicateResults(toolResults);
    const staleResults = this.findStaleResults(toolResults);
    const tokenBreakdown = this.calculateToolResultTokens(toolResults);
    const optimizationSuggestions = this.generateOptimizationSuggestions(
      toolResults, duplicates, staleResults
    );

    return {
      duplicates,
      staleResults,
      tokenBreakdown,
      optimizationSuggestions
    };
  }

  /**
   * Find duplicate tool results based on content similarity
   */
  private findDuplicateResults(toolResults: ToolResultContext[]): ToolResultContext[][] {
    const duplicateGroups: ToolResultContext[][] = [];
    const processed = new Set<string>();

    for (const result of toolResults) {
      if (processed.has(result.executionId)) continue;

      const similarResults = toolResults.filter(other => 
        other.executionId !== result.executionId &&
        !processed.has(other.executionId) &&
        this.calculateContentSimilarity(result, other) > this.DUPLICATE_SIMILARITY_THRESHOLD
      );

      if (similarResults.length > 0) {
        const group = [result, ...similarResults];
        duplicateGroups.push(group);
        
        // Mark all in this group as processed
        group.forEach(r => processed.add(r.executionId));
      }
    }

    return duplicateGroups;
  }

  /**
   * Find stale tool results that are outdated
   */
  private findStaleResults(toolResults: ToolResultContext[]): ToolResultContext[] {
    const now = Date.now();
    
    return toolResults.filter(result => {
      // File reads older than 30 minutes are potentially stale
      if (result.resultType === 'file_read' && 
          (now - result.timestamp) > this.STALE_THRESHOLD_MS) {
        return true;
      }

      // Command outputs older than 10 minutes are likely stale
      if (result.resultType === 'command_output' &&
          (now - result.timestamp) > (10 * 60 * 1000)) {
        return true;
      }

      // Search results older than 15 minutes may be stale
      if (result.resultType === 'search_results' &&
          (now - result.timestamp) > (15 * 60 * 1000)) {
        return true;
      }

      return result.isStale;
    });
  }

  /**
   * Calculate comprehensive token breakdown for tool results
   */
  private calculateToolResultTokens(toolResults: ToolResultContext[]): ContextTokenBreakdown {
    const categoryTotals = new Map<string, number>();
    const categoryExamples = new Map<string, string[]>();
    
    let totalTokens = 0;
    let totalFileReadTokens = 0;
    let totalCommandOutputTokens = 0;
    let totalSearchResultTokens = 0;
    let totalMcpResponseTokens = 0;

    for (const result of toolResults) {
      const resultTokens = result.inputTokens + result.outputTokens;
      totalTokens += resultTokens;

      // Categorize by result type
      switch (result.resultType) {
        case 'file_read':
          totalFileReadTokens += resultTokens;
          this.addToCategory(categoryTotals, categoryExamples, 'File Reads', 
                            resultTokens, result.filePath || result.toolName);
          break;
        case 'command_output':
          totalCommandOutputTokens += resultTokens;
          this.addToCategory(categoryTotals, categoryExamples, 'Command Outputs', 
                            resultTokens, `${result.toolName} execution`);
          break;
        case 'search_results':
          totalSearchResultTokens += resultTokens;
          this.addToCategory(categoryTotals, categoryExamples, 'Search Results', 
                            resultTokens, `${result.toolName} search`);
          break;
        case 'mcp_response':
          totalMcpResponseTokens += resultTokens;
          this.addToCategory(categoryTotals, categoryExamples, 'MCP Responses', 
                            resultTokens, result.toolName);
          break;
        default:
          this.addToCategory(categoryTotals, categoryExamples, 'Other Tool Results', 
                            resultTokens, result.toolName);
      }
    }

    const breakdown: TokenCategoryBreakdown[] = Array.from(categoryTotals.entries()).map(
      ([category, tokenCount]) => ({
        category,
        tokenCount,
        percentage: totalTokens > 0 ? (tokenCount / totalTokens) * 100 : 0,
        examples: categoryExamples.get(category) || [],
        prunablePotential: this.estimatePrunablePotential(category, tokenCount)
      })
    );

    return {
      messageTokens: 0, // This analyzer only handles tool results
      systemTokens: 0,
      toolResultTokens: totalTokens,
      mcpResponseTokens: totalMcpResponseTokens,
      backgroundTokens: 0,
      totalTokens,
      breakdown,
      estimationAccuracy: 0.85 // Conservative accuracy estimate
    };
  }

  /**
   * Generate optimization suggestions based on analysis
   */
  private generateOptimizationSuggestions(
    toolResults: ToolResultContext[],
    duplicates: ToolResultContext[][],
    staleResults: ToolResultContext[]
  ): string[] {
    const suggestions: string[] = [];

    // Duplicate analysis
    if (duplicates.length > 0) {
      const totalDuplicateTokens = duplicates.reduce((sum, group) => 
        sum + group.slice(1).reduce((groupSum, result) => 
          groupSum + result.inputTokens + result.outputTokens, 0), 0);
      
      suggestions.push(
        `Remove ${duplicates.length} duplicate tool result groups (${totalDuplicateTokens} tokens)`
      );
    }

    // Stale results analysis  
    if (staleResults.length > 0) {
      const totalStaleTokens = staleResults.reduce((sum, result) => 
        sum + result.inputTokens + result.outputTokens, 0);
      
      suggestions.push(
        `Archive ${staleResults.length} stale tool results (${totalStaleTokens} tokens)`
      );
    }

    // Large file analysis
    const largeFiles = toolResults.filter(result => 
      result.resultType === 'file_read' && 
      (result.inputTokens + result.outputTokens) > 5000
    );

    if (largeFiles.length > 0) {
      suggestions.push(
        `Consider summarizing ${largeFiles.length} large file reads (>5k tokens each)`
      );
    }

    // Repetitive command analysis
    const commandCounts = new Map<string, number>();
    toolResults.filter(r => r.resultType === 'command_output')
              .forEach(r => commandCounts.set(r.toolName, (commandCounts.get(r.toolName) || 0) + 1));

    const repetitiveCommands = Array.from(commandCounts.entries())
      .filter(([, count]) => count > 3);

    if (repetitiveCommands.length > 0) {
      suggestions.push(
        `Consolidate repetitive command outputs: ${repetitiveCommands.map(([cmd, count]) => 
          `${cmd} (${count}x)`).join(', ')}`
      );
    }

    return suggestions;
  }

  /**
   * Calculate content similarity between two tool results
   */
  private calculateContentSimilarity(result1: ToolResultContext, result2: ToolResultContext): number {
    // Same content hash = identical
    if (result1.contentHash === result2.contentHash) return 1.0;

    // Different types = not similar
    if (result1.resultType !== result2.resultType) return 0.0;

    // For file reads, check if same file path
    if (result1.resultType === 'file_read' && result1.filePath === result2.filePath) {
      return 0.9; // Same file, potentially different versions
    }

    // Basic content similarity using simple string comparison
    const content1 = result1.content.toLowerCase().replace(/\s+/g, ' ').trim();
    const content2 = result2.content.toLowerCase().replace(/\s+/g, ' ').trim();

    if (content1.length === 0 || content2.length === 0) return 0.0;

    // Simple Jaccard similarity for now
    const set1 = new Set(content1.split(' '));
    const set2 = new Set(content2.split(' '));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Helper methods
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substr(0, 16);
  }

  private indexContentHash(hash: string, executionId: string): void {
    if (!this.contentHashIndex.has(hash)) {
      this.contentHashIndex.set(hash, []);
    }
    this.contentHashIndex.get(hash)!.push(executionId);
  }

  private estimateTokens(text: string): number {
    // Improved token estimation: ~4 characters per token, but account for structure
    const baseEstimate = Math.ceil(text.length / 4);
    
    // Add overhead for structured content
    const lines = text.split('\n').length;
    const codeBlocks = (text.match(/```/g) || []).length / 2;
    const jsonStructures = (text.match(/[{}[\]]/g) || []).length;
    
    return baseEstimate + Math.ceil(lines * 0.1) + Math.ceil(codeBlocks * 10) + Math.ceil(jsonStructures * 0.2);
  }

  private addToCategory(
    totals: Map<string, number>, 
    examples: Map<string, string[]>, 
    category: string, 
    tokens: number, 
    example: string
  ): void {
    totals.set(category, (totals.get(category) || 0) + tokens);
    
    if (!examples.has(category)) {
      examples.set(category, []);
    }
    const categoryExamples = examples.get(category)!;
    if (categoryExamples.length < 3) {
      categoryExamples.push(example);
    }
  }

  private estimatePrunablePotential(category: string, tokenCount: number): number {
    // Estimate how many tokens could be pruned from each category
    switch (category) {
      case 'File Reads': return Math.ceil(tokenCount * 0.4); // 40% through deduplication/summarization
      case 'Command Outputs': return Math.ceil(tokenCount * 0.6); // 60% through compression
      case 'Search Results': return Math.ceil(tokenCount * 0.5); // 50% through deduplication
      case 'MCP Responses': return Math.ceil(tokenCount * 0.3); // 30% through selective retention
      default: return Math.ceil(tokenCount * 0.2); // 20% conservative estimate
    }
  }

  /**
   * Get cached tool results by execution ID
   */
  getToolResult(executionId: string): ToolResultContext | undefined {
    return this.toolResultCache.get(executionId);
  }

  /**
   * Get all cached tool results
   */
  getAllToolResults(): ToolResultContext[] {
    return Array.from(this.toolResultCache.values());
  }

  /**
   * Clear the tool result cache
   */
  clearCache(): void {
    this.toolResultCache.clear();
    this.contentHashIndex.clear();
  }
}