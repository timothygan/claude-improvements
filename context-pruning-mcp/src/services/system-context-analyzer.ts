/**
 * System Context Analyzer - Manages system context components like CLAUDE.md, environment, and configuration
 * Handles system instructions, tool permissions, and session metadata
 */

import type {
  SystemContext,
  ToolPermissionConfig,
  SessionContext,
  CompactionEvent,
  ContextTokenBreakdown
} from '../types.js';

export class SystemContextAnalyzer {
  private readonly CLAUDE_MD_TOKEN_LIMIT = 5000;
  private readonly MAX_ENVIRONMENT_VARIABLES = 50;

  /**
   * Analyze system context and calculate token usage
   */
  analyzeSystemContext(systemContext: SystemContext): {
    tokenBreakdown: ContextTokenBreakdown;
    optimizationSuggestions: string[];
    isWithinLimits: boolean;
  } {
    const tokenBreakdown = this.calculateSystemTokens(systemContext);
    const optimizationSuggestions = this.generateSystemOptimizations(systemContext);
    const isWithinLimits = this.checkSystemContextLimits(systemContext);

    return {
      tokenBreakdown,
      optimizationSuggestions,
      isWithinLimits
    };
  }

  /**
   * Calculate comprehensive token breakdown for system context
   */
  private calculateSystemTokens(systemContext: SystemContext): ContextTokenBreakdown {
    const systemInstructionTokens = this.estimateTokens(systemContext.systemInstructions);
    const claudeMdTokens = this.estimateTokens(systemContext.claudeMdContent);
    const claudeLocalMdTokens = systemContext.claudeLocalMdContent ? 
      this.estimateTokens(systemContext.claudeLocalMdContent) : 0;
    
    const environmentTokens = this.calculateEnvironmentTokens(systemContext.environmentVariables);
    const permissionTokens = this.calculatePermissionTokens(systemContext.toolPermissions);
    const gitStatusTokens = systemContext.gitStatus ? 
      this.estimateTokens(systemContext.gitStatus) : 0;

    const totalSystemTokens = systemInstructionTokens + claudeMdTokens + claudeLocalMdTokens +
                             environmentTokens + permissionTokens + gitStatusTokens;

    const breakdown = [
      {
        category: 'System Instructions',
        tokenCount: systemInstructionTokens,
        percentage: (systemInstructionTokens / totalSystemTokens) * 100,
        examples: ['Environment setup', 'User preferences', 'Global configurations'],
        prunablePotential: Math.ceil(systemInstructionTokens * 0.1) // 10% - minimal pruning for system instructions
      },
      {
        category: 'CLAUDE.md Content',
        tokenCount: claudeMdTokens,
        percentage: (claudeMdTokens / totalSystemTokens) * 100,
        examples: ['Project memory', 'Code standards', 'Context instructions'],
        prunablePotential: Math.ceil(claudeMdTokens * 0.3) // 30% - can optimize repetitive sections
      },
      {
        category: 'CLAUDE.local.md Content',
        tokenCount: claudeLocalMdTokens,
        percentage: (claudeLocalMdTokens / totalSystemTokens) * 100,
        examples: ['Local overrides', 'Personal settings', 'Machine-specific config'],
        prunablePotential: Math.ceil(claudeLocalMdTokens * 0.2) // 20% - moderate optimization potential
      },
      {
        category: 'Environment Variables',
        tokenCount: environmentTokens,
        percentage: (environmentTokens / totalSystemTokens) * 100,
        examples: ['PATH', 'Working directory', 'Git configuration'],
        prunablePotential: Math.ceil(environmentTokens * 0.4) // 40% - many env vars are redundant
      },
      {
        category: 'Tool Permissions',
        tokenCount: permissionTokens,
        percentage: (permissionTokens / totalSystemTokens) * 100,
        examples: ['File access rules', 'Command permissions', 'Security settings'],
        prunablePotential: Math.ceil(permissionTokens * 0.1) // 10% - essential for security
      },
      {
        category: 'Git Status',
        tokenCount: gitStatusTokens,
        percentage: (gitStatusTokens / totalSystemTokens) * 100,
        examples: ['Branch info', 'Modified files', 'Staged changes'],
        prunablePotential: Math.ceil(gitStatusTokens * 0.5) // 50% - can summarize git status
      }
    ].filter(item => item.tokenCount > 0);

    return {
      messageTokens: 0,
      systemTokens: totalSystemTokens,
      toolResultTokens: 0,
      mcpResponseTokens: 0,
      backgroundTokens: 0,
      totalTokens: totalSystemTokens,
      breakdown,
      estimationAccuracy: 0.9 // High accuracy for system context
    };
  }

  /**
   * Generate optimization suggestions for system context
   */
  private generateSystemOptimizations(
    systemContext: SystemContext
  ): string[] {
    const suggestions: string[] = [];

    // CLAUDE.md optimization
    const claudeMdTokens = this.estimateTokens(systemContext.claudeMdContent);
    if (claudeMdTokens > this.CLAUDE_MD_TOKEN_LIMIT) {
      suggestions.push(
        `CLAUDE.md is ${claudeMdTokens} tokens (limit: ${this.CLAUDE_MD_TOKEN_LIMIT}). Consider splitting into sections or removing redundant content.`
      );
    }

    // Check for repetitive content in CLAUDE.md
    if (this.hasRepetitiveContent(systemContext.claudeMdContent)) {
      suggestions.push(
        'CLAUDE.md contains repetitive content. Consider consolidating similar sections.'
      );
    }

    // Environment variables optimization
    const envVarCount = Object.keys(systemContext.environmentVariables).length;
    if (envVarCount > this.MAX_ENVIRONMENT_VARIABLES) {
      suggestions.push(
        `${envVarCount} environment variables tracked (recommended: <${this.MAX_ENVIRONMENT_VARIABLES}). Consider filtering to essential variables only.`
      );
    }

    // Large environment variable values
    const largeEnvVars = Object.entries(systemContext.environmentVariables)
      .filter(([, value]) => value.length > 500)
      .map(([key]) => key);
    
    if (largeEnvVars.length > 0) {
      suggestions.push(
        `Large environment variables detected: ${largeEnvVars.join(', ')}. Consider truncating or excluding these.`
      );
    }

    // Tool permissions optimization
    if (systemContext.toolPermissions.length > 20) {
      suggestions.push(
        `${systemContext.toolPermissions.length} tool permissions configured. Consider consolidating similar permissions.`
      );
    }

    // Git status optimization
    if (systemContext.gitStatus && systemContext.gitStatus.length > 1000) {
      suggestions.push(
        'Git status is lengthy. Consider summarizing or focusing on essential changes only.'
      );
    }

    return suggestions;
  }

  /**
   * Check if system context is within recommended limits
   */
  private checkSystemContextLimits(systemContext: SystemContext): boolean {
    const claudeMdTokens = this.estimateTokens(systemContext.claudeMdContent);
    const envVarCount = Object.keys(systemContext.environmentVariables).length;
    const totalSystemTokens = systemContext.totalTokens;

    return claudeMdTokens <= this.CLAUDE_MD_TOKEN_LIMIT &&
           envVarCount <= this.MAX_ENVIRONMENT_VARIABLES &&
           totalSystemTokens <= 10000; // Reasonable system context limit
  }

  /**
   * Optimize CLAUDE.md content by removing redundancy
   */
  optimizeClaudeMdContent(content: string): {
    optimizedContent: string;
    tokensSaved: number;
    changes: string[];
  } {
    const originalTokens = this.estimateTokens(content);
    let optimizedContent = content;
    const changes: string[] = [];

    // Remove duplicate lines
    const lines = content.split('\n');
    const uniqueLines = [...new Set(lines)];
    if (uniqueLines.length < lines.length) {
      optimizedContent = uniqueLines.join('\n');
      changes.push(`Removed ${lines.length - uniqueLines.length} duplicate lines`);
    }

    // Remove excessive whitespace
    optimizedContent = optimizedContent.replace(/\n{3,}/g, '\n\n');
    if (optimizedContent !== content) {
      changes.push('Reduced excessive whitespace');
    }

    // Remove empty sections
    optimizedContent = optimizedContent.replace(/#{1,6}\s*\n+(?=#{1,6}|\n*$)/g, '');
    if (optimizedContent.length < content.length && changes.length === 2) {
      changes.push('Removed empty sections');
    }

    const finalTokens = this.estimateTokens(optimizedContent);
    const tokensSaved = originalTokens - finalTokens;

    return {
      optimizedContent,
      tokensSaved,
      changes
    };
  }

  /**
   * Create session context for tracking session metadata
   */
  createSessionContext(
    sessionId: string,
    startTime: number,
    contextWindowUsage: number,
    contextWindowLimit: number = 200000
  ): SessionContext {
    return {
      sessionId,
      startTime,
      duration: Date.now() - startTime,
      contextWindowUsage,
      contextWindowLimit,
      autoCompactionHistory: [],
      parallelSessions: [],
      isApproachingLimit: contextWindowUsage / contextWindowLimit > 0.9
    };
  }

  /**
   * Add compaction event to session history
   */
  addCompactionEvent(
    sessionContext: SessionContext,
    event: Omit<CompactionEvent, 'timestamp'>
  ): SessionContext {
    const compactionEvent: CompactionEvent = {
      ...event,
      timestamp: Date.now()
    };

    return {
      ...sessionContext,
      autoCompactionHistory: [...sessionContext.autoCompactionHistory, compactionEvent]
    };
  }

  /**
   * Helper methods
   */
  private calculateEnvironmentTokens(envVars: Record<string, string>): number {
    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    return this.estimateTokens(envContent);
  }

  private calculatePermissionTokens(permissions: ToolPermissionConfig[]): number {
    const permissionContent = permissions.map(p => 
      JSON.stringify(p, null, 2)
    ).join('\n');
    
    return this.estimateTokens(permissionContent);
  }

  private hasRepetitiveContent(content: string): boolean {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const uniqueLines = new Set(lines);
    
    // If less than 80% of lines are unique, consider it repetitive
    return uniqueLines.size / lines.length < 0.8;
  }

  private estimateTokens(text: string): number {
    if (!text) return 0;
    
    // Enhanced token estimation accounting for markdown structure
    const baseEstimate = Math.ceil(text.length / 4);
    
    // Add overhead for markdown elements
    const headers = (text.match(/^#{1,6}\s/gm) || []).length;
    const codeBlocks = (text.match(/```/g) || []).length / 2;
    const listItems = (text.match(/^\s*[-*+]\s/gm) || []).length;
    const links = (text.match(/\[.*?\]\(.*?\)/g) || []).length;
    
    return baseEstimate + 
           Math.ceil(headers * 2) + 
           Math.ceil(codeBlocks * 5) + 
           Math.ceil(listItems * 1.5) + 
           Math.ceil(links * 3);
  }
}