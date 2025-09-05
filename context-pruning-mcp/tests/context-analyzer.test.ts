/**
 * Tests for Context Analyzer
 */

import { ContextAnalyzer } from '../src/context-analyzer';
import type { ConversationContext, ConversationMessage } from '../src/types';

const mockMessage = (
  id: string,
  content: string,
  type: ConversationMessage['type'] = 'query',
  timestamp = Date.now()
): ConversationMessage => ({
  id,
  timestamp,
  type,
  role: 'user',
  content,
  metadata: {
    tokenCount: Math.ceil(content.length / 4),
    fileReferences: [],
    codeBlocks: [],
    hasError: false,
    toolsUsed: [],
  },
});

const mockContext = (messages: ConversationMessage[]): ConversationContext => ({
  messages,
  totalTokens: messages.reduce((sum, msg) => sum + msg.metadata.tokenCount, 0),
  activeFiles: [],
  sessionStartTime: Date.now() - 3600000, // 1 hour ago
});

describe('ContextAnalyzer', () => {
  let analyzer: ContextAnalyzer;

  beforeEach(() => {
    analyzer = new ContextAnalyzer();
  });

  describe('analyze', () => {
    it('should analyze conversation context correctly', async () => {
      const messages = [
        mockMessage('msg1', 'How do I implement a function?'),
        mockMessage('msg2', 'Create a function that calculates prime numbers', 'code_change'),
        mockMessage('msg3', 'Error: TypeError in line 10', 'error'),
      ];

      const context = mockContext(messages);
      const result = await analyzer.analyze(context);

      expect(result.totalMessages).toBe(3);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.averageImportance).toBeGreaterThan(0);
      expect(result.redundancyScore).toBeGreaterThanOrEqual(0);
      expect(['aggressive', 'balanced', 'conservative']).toContain(result.recommendedStrategy);
    });

    it('should recommend aggressive strategy for high token count', async () => {
      const largeMessage = 'A'.repeat(600000); // ~150k tokens
      const messages = [mockMessage('msg1', largeMessage)];
      const context = mockContext(messages);

      const result = await analyzer.analyze(context);
      expect(result.recommendedStrategy).toBe('aggressive');
    });
  });

  describe('scoreMessages', () => {
    it('should assign higher scores to error messages', async () => {
      const messages = [
        mockMessage('msg1', 'Regular query'),
        mockMessage('msg2', 'Error: Failed to compile', 'error'),
      ];

      const context = mockContext(messages);
      const scoredMessages = await analyzer.scoreMessages(context);

      const regularMsg = scoredMessages.find(m => m.id === 'msg1');
      const errorMsg = scoredMessages.find(m => m.id === 'msg2');

      expect(errorMsg?.metadata.importance?.total).toBeGreaterThan(
        regularMsg?.metadata.importance?.total ?? 0
      );
    });

    it('should assign higher recency scores to newer messages', async () => {
      const oldTimestamp = Date.now() - 3600000; // 1 hour ago
      const newTimestamp = Date.now() - 60000; // 1 minute ago

      const messages = [
        mockMessage('old', 'Old message', 'query', oldTimestamp),
        mockMessage('new', 'New message', 'query', newTimestamp),
      ];

      const context = mockContext(messages);
      const scoredMessages = await analyzer.scoreMessages(context);

      const oldMsg = scoredMessages.find(m => m.id === 'old');
      const newMsg = scoredMessages.find(m => m.id === 'new');

      expect(newMsg?.metadata.importance?.recency).toBeGreaterThan(
        oldMsg?.metadata.importance?.recency ?? 0
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty conversation', async () => {
      const context = mockContext([]);
      const result = await analyzer.analyze(context);

      expect(result.totalMessages).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.averageImportance).toBe(0);
    });

    it('should handle messages without importance scores', async () => {
      const messages = [mockMessage('msg1', 'Test message')];
      const context = mockContext(messages);

      const result = await analyzer.analyze(context);
      expect(result).toBeDefined();
      expect(result.averageImportance).toBeGreaterThanOrEqual(0);
    });
  });
});