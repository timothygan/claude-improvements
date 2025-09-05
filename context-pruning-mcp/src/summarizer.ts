/**
 * Hierarchical Summarizer - Multi-level conversation summarization
 * Creates context-aware summaries at different granularity levels
 */

import type {
  ConversationContext,
  ConversationMessage,
  Summary,
  SummaryLevel,
} from './types.js';

export class Summarizer {
  private readonly MAX_SUMMARY_LENGTH: Record<SummaryLevel, number> = {
    immediate: 200,
    session: 500,
    project: 1000,
  };

  private readonly SUMMARY_PATTERNS = {
    codeChanges: /(?:created?|updated?|modified|deleted?|refactored?|implemented?)\s+.*?(?:function|class|method|file|component)/gi,
    errors: /(?:error|exception|failed?|bug|issue).*?(?:\n|$)/gi,
    fileOperations: /(?:read|wrote|edited|created|deleted)\s+.*?\.[\w]+/gi,
    tools: /(?:used?|ran|executed?)\s+(?:tool|command|script)/gi,
  };

  /**
   * Create hierarchical summaries for conversation segments
   */
  async createSummaries(
    context: ConversationContext,
    level: SummaryLevel
  ): Promise<Summary[]> {
    const segments = this.segmentConversation(context.messages, level);
    const summaries: Summary[] = [];

    for (const segment of segments) {
      const summary = await this.createSummary(segment, level);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  /**
   * Segment conversation into meaningful chunks based on summary level
   */
  private segmentConversation(
    messages: readonly ConversationMessage[],
    level: SummaryLevel
  ): ConversationMessage[][] {
    switch (level) {
      case 'immediate':
        return this.segmentByInteraction(messages);
      case 'session':
        return this.segmentByTopic(messages);
      case 'project':
        return this.segmentByFileContext(messages);
      default:
        return [Array.from(messages)];
    }
  }

  /**
   * Segment by user-assistant interaction pairs
   */
  private segmentByInteraction(
    messages: readonly ConversationMessage[]
  ): ConversationMessage[][] {
    const segments: ConversationMessage[][] = [];
    let currentSegment: ConversationMessage[] = [];

    for (const message of messages) {
      currentSegment.push(message);

      if (
        message.role === 'assistant' &&
        currentSegment.length >= 2 &&
        currentSegment.some(m => m.role === 'user')
      ) {
        segments.push([...currentSegment]);
        currentSegment = [];
      }
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Segment by topic similarity and context breaks
   */
  private segmentByTopic(
    messages: readonly ConversationMessage[]
  ): ConversationMessage[][] {
    const segments: ConversationMessage[][] = [];
    let currentSegment: ConversationMessage[] = [];
    let lastFiles = new Set<string>();

    for (const message of messages) {
      const messageFiles = new Set(message.metadata.fileReferences);
      const hasFileContextChange = this.hasSignificantFileContextChange(
        lastFiles,
        messageFiles
      );

      if (hasFileContextChange && currentSegment.length > 0) {
        segments.push([...currentSegment]);
        currentSegment = [];
      }

      currentSegment.push(message);
      lastFiles = new Set([...lastFiles, ...messageFiles]);

      if (currentSegment.length >= 10) {
        segments.push([...currentSegment]);
        currentSegment = [];
        lastFiles.clear();
      }
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Segment by file and project context
   */
  private segmentByFileContext(
    messages: readonly ConversationMessage[]
  ): ConversationMessage[][] {
    const fileGroups = new Map<string, ConversationMessage[]>();
    const generalMessages: ConversationMessage[] = [];

    for (const message of messages) {
      if (message.metadata.fileReferences.length > 0) {
        const primaryFile = message.metadata.fileReferences[0];
        if (primaryFile) {
          if (!fileGroups.has(primaryFile)) {
            fileGroups.set(primaryFile, []);
          }
          fileGroups.get(primaryFile)?.push(message);
        }
      } else {
        generalMessages.push(message);
      }
    }

    const segments = Array.from(fileGroups.values());
    if (generalMessages.length > 0) {
      segments.unshift(generalMessages);
    }

    return segments;
  }

  /**
   * Check if there's a significant change in file context
   */
  private hasSignificantFileContextChange(
    oldFiles: Set<string>,
    newFiles: Set<string>
  ): boolean {
    if (oldFiles.size === 0) return false;

    const intersection = new Set([...oldFiles].filter(f => newFiles.has(f)));
    const union = new Set([...oldFiles, ...newFiles]);

    const jaccardSimilarity = intersection.size / union.size;
    return jaccardSimilarity < 0.3;
  }

  /**
   * Create a summary for a message segment
   */
  private async createSummary(
    messages: ConversationMessage[],
    level: SummaryLevel
  ): Promise<Summary | null> {
    if (messages.length === 0) return null;

    const summaryContent = this.generateSummaryContent(messages, level);
    if (!summaryContent.trim()) return null;

    const tokensSaved = this.calculateTokensSaved(messages, summaryContent);

    return {
      id: this.generateSummaryId(),
      level,
      content: summaryContent,
      originalMessageIds: messages.map(m => m.id),
      tokensSaved,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate summary content based on message analysis
   */
  private generateSummaryContent(
    messages: ConversationMessage[],
    level: SummaryLevel
  ): string {
    const maxLength = this.MAX_SUMMARY_LENGTH[level];
    const activities = this.extractActivities(messages);
    const codeChanges = this.extractCodeChanges(messages);
    const fileOperations = this.extractFileOperations(messages);
    const errors = this.extractErrors(messages);

    let summary = '';

    if (activities.length > 0) {
      summary += `Activities: ${activities.join(', ')}. `;
    }

    if (codeChanges.length > 0) {
      summary += `Code changes: ${codeChanges.join(', ')}. `;
    }

    if (fileOperations.length > 0) {
      summary += `File operations: ${fileOperations.join(', ')}. `;
    }

    if (errors.length > 0) {
      summary += `Errors encountered: ${errors.join(', ')}. `;
    }

    const outcome = this.determineOutcome(messages);
    if (outcome) {
      summary += `Outcome: ${outcome}`;
    }

    return this.truncateSummary(summary, maxLength);
  }

  /**
   * Extract key activities from messages
   */
  private extractActivities(messages: ConversationMessage[]): string[] {
    const activities = new Set<string>();

    for (const message of messages) {
      const content = message.content.toLowerCase();

      if (content.includes('implement') || content.includes('create')) {
        activities.add('implementation');
      }
      if (content.includes('fix') || content.includes('debug')) {
        activities.add('debugging');
      }
      if (content.includes('refactor') || content.includes('improve')) {
        activities.add('refactoring');
      }
      if (content.includes('test') || content.includes('verify')) {
        activities.add('testing');
      }
      if (message.metadata.toolsUsed.length > 0) {
        activities.add('tool usage');
      }
    }

    return Array.from(activities);
  }

  /**
   * Extract code changes from messages
   */
  private extractCodeChanges(messages: ConversationMessage[]): string[] {
    const changes = new Set<string>();

    for (const message of messages) {
      const content = message.content;
      const matches = content.match(this.SUMMARY_PATTERNS.codeChanges);

      if (matches) {
        for (const match of matches) {
          changes.add(this.cleanExtractedText(match));
        }
      }

      for (const codeBlock of message.metadata.codeBlocks) {
        if (codeBlock.filePath) {
          changes.add(`modified ${codeBlock.filePath}`);
        } else {
          changes.add(`${codeBlock.language} code`);
        }
      }
    }

    return Array.from(changes).slice(0, 5);
  }

  /**
   * Extract file operations from messages
   */
  private extractFileOperations(messages: ConversationMessage[]): string[] {
    const operations = new Set<string>();

    for (const message of messages) {
      const content = message.content;
      const matches = content.match(this.SUMMARY_PATTERNS.fileOperations);

      if (matches) {
        for (const match of matches) {
          operations.add(this.cleanExtractedText(match));
        }
      }

      if (message.metadata.fileReferences.length > 0) {
        for (const file of message.metadata.fileReferences) {
          operations.add(`worked on ${file}`);
        }
      }
    }

    return Array.from(operations).slice(0, 3);
  }

  /**
   * Extract errors and issues from messages
   */
  private extractErrors(messages: ConversationMessage[]): string[] {
    const errors = new Set<string>();

    for (const message of messages) {
      if (message.metadata.hasError) {
        const content = message.content;
        const matches = content.match(this.SUMMARY_PATTERNS.errors);

        if (matches) {
          for (const match of matches) {
            errors.add(this.cleanExtractedText(match));
          }
        }
      }
    }

    return Array.from(errors).slice(0, 2);
  }

  /**
   * Determine the outcome of a conversation segment
   */
  private determineOutcome(messages: ConversationMessage[]): string {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return '';

    if (lastMessage.metadata.hasError) {
      return 'unresolved';
    }

    if (
      lastMessage.type === 'success' ||
      lastMessage.content.toLowerCase().includes('complete') ||
      lastMessage.content.toLowerCase().includes('done')
    ) {
      return 'completed successfully';
    }

    if (lastMessage.type === 'code_change') {
      return 'implemented changes';
    }

    return 'in progress';
  }

  /**
   * Clean extracted text for summary inclusion
   */
  private cleanExtractedText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[^\w]+|[^\w]+$/g, '')
      .toLowerCase();
  }

  /**
   * Truncate summary to maximum length while preserving sentence structure
   */
  private truncateSummary(summary: string, maxLength: number): string {
    if (summary.length <= maxLength) return summary;

    const truncated = summary.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    return lastSentenceEnd > maxLength * 0.7
      ? truncated.substring(0, lastSentenceEnd + 1)
      : truncated + '...';
  }

  /**
   * Calculate tokens saved by summarization
   */
  private calculateTokensSaved(
    originalMessages: ConversationMessage[],
    summaryContent: string
  ): number {
    const originalTokens = originalMessages.reduce(
      (sum, msg) => sum + msg.metadata.tokenCount,
      0
    );
    const summaryTokens = Math.ceil(summaryContent.length / 4);
    return Math.max(0, originalTokens - summaryTokens);
  }

  /**
   * Generate unique summary ID
   */
  private generateSummaryId(): string {
    return `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}