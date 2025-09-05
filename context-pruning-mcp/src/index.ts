#!/usr/bin/env node

/**
 * Context Pruning MCP Server
 * Intelligent context optimization for Claude Code conversations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { ContextAnalyzer } from './context-analyzer.js';
import { PruningEngine } from './pruning-engine.js';
import { Summarizer } from './summarizer.js';
import {
  type ConversationContext,
  type ConversationMessage,
  DEFAULT_STRATEGIES,
  ContextPruningError,
} from './types.js';

class ContextPruningServer {
  private readonly server: Server;
  private readonly contextAnalyzer: ContextAnalyzer;
  private readonly pruningEngine: PruningEngine;
  private readonly summarizer: Summarizer;

  constructor() {
    this.server = new Server(
      {
        name: 'context-pruning-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.contextAnalyzer = new ContextAnalyzer();
    this.pruningEngine = new PruningEngine();
    this.summarizer = new Summarizer();


    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'prune_context',
          description:
            'Intelligently prune conversation context to reduce tokens while preserving important information',
          inputSchema: {
            type: 'object',
            properties: {
              conversation: {
                type: 'array',
                items: { type: 'object' },
                description: 'Array of conversation messages to prune. CRITICAL: Must include full tool result content, not summaries. Each message should have: {role: "user"|"assistant"|"tool", content: "full_content", tool_name?: "ToolName", timestamp?: number}. Tool results must contain complete file contents, command outputs, search results - not truncated summaries.',
              },
              strategy: {
                type: 'string',
                enum: ['aggressive', 'balanced', 'conservative'],
                description: 'Pruning strategy to use',
                default: 'balanced',
              },
              maxTokens: {
                type: 'number',
                description: 'Maximum tokens to retain after pruning',
                minimum: 1000,
              },
            },
            required: ['conversation'],
          },
        },
        {
          name: 'analyze_conversation',
          description:
            'Analyze conversation context and provide optimization recommendations. WARNING: Only analyzes the data you provide - if you pass message summaries instead of full tool results, analysis will be severely inaccurate.',
          inputSchema: {
            type: 'object',
            properties: {
              conversation: {
                type: 'array',
                items: { type: 'object' },
                description: 'Array of conversation messages to analyze. MUST include complete tool result content to be accurate. For tool results, include: {role: "tool", tool_name: "Read|Bash|Grep|Write|etc", content: "FULL_RESULT_CONTENT", timestamp: number}. File reads should contain entire file contents, command outputs should include complete terminal output, search results should contain all matches. Do NOT truncate or summarize - this defeats the purpose of token analysis.',
              },
            },
            required: ['conversation'],
          },
        },
        {
          name: 'summarize_session',
          description:
            'Create hierarchical summaries of conversation segments',
          inputSchema: {
            type: 'object',
            properties: {
              conversation: {
                type: 'array',
                items: { type: 'object' },
                description: 'Array of conversation messages to summarize. Include full tool result content for accurate summarization. Tool results with truncated content will produce incomplete summaries.',
              },
              level: {
                type: 'string',
                enum: ['immediate', 'session', 'project'],
                description: 'Summary granularity level',
                default: 'session',
              },
            },
            required: ['conversation'],
          },
        },
        {
          name: 'rollback_pruning',
          description: 'Rollback the last pruning operation if available',
          inputSchema: {
            type: 'object',
            properties: {
              pruningId: {
                type: 'string',
                description: 'ID of the pruning operation to rollback',
              },
            },
            required: ['pruningId'],
          },
        },
        {
          name: 'configure_pruning',
          description: 'Update pruning configuration settings',
          inputSchema: {
            type: 'object',
            properties: {
              strategy: {
                type: 'string',
                enum: ['aggressive', 'balanced', 'conservative'],
                description: 'Default pruning strategy',
              },
              autoTriggerThreshold: {
                type: 'number',
                description: 'Token count threshold for automatic pruning',
                minimum: 10000,
              },
              enableRollback: {
                type: 'boolean',
                description: 'Enable rollback functionality',
              },
            },
          },
        },
        {
          name: 'test_simple',
          description: 'Simple test tool for debugging',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Test message',
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'prune_context':
            return await this.handlePruneContext(args);
          case 'analyze_conversation':
            return await this.handleAnalyzeConversation(args);
          case 'summarize_session':
            return await this.handleSummarizeSession(args);
          case 'rollback_pruning':
            return await this.handleRollbackPruning(args);
          case 'configure_pruning':
            return await this.handleConfigurePruning(args);
          case 'test_simple':
            return await this.handleTestSimple(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof ContextPruningError) {
          throw new McpError(ErrorCode.InternalError, error.message);
        }
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async handlePruneContext(args: unknown): Promise<CallToolResult> {
    try {
      const { conversation, strategy = 'balanced', maxTokens } = args as {
        conversation: unknown[];
        strategy?: 'aggressive' | 'balanced' | 'conservative';
        maxTokens?: number;
      };

      const context = await this.parseConversation(conversation);
      const activeStrategy = maxTokens
        ? { ...DEFAULT_STRATEGIES[strategy], maxTokens }
        : DEFAULT_STRATEGIES[strategy];

      const result = await this.pruningEngine.prune(context, activeStrategy);

      return {
        content: [
          {
            type: 'text',
            text: `Context pruned successfully:\n- Original tokens: ${result.originalTokens || 0}\n- Final tokens: ${result.finalTokens || 0}\n- Reduction: ${(result.reductionPercent || 0).toFixed(1)}%\n- Messages removed: ${result.messagesRemoved || 0}\n- Messages summarized: ${result.messagesSummarized || 0}\n- Summaries created: ${result.summariesCreated?.length || 0}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error pruning context: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async handleAnalyzeConversation(args: unknown): Promise<CallToolResult> {
    try {
      const { conversation } = args as { conversation: unknown[] };
      const context = await this.parseConversation(conversation);
      
      // Get detailed breakdown including system context and tool results
      const detailedAnalysis = await this.contextAnalyzer.getDetailedContextBreakdown(context);
      const analysis = await this.contextAnalyzer.analyze(context);

      // Convert 0.0-1.0 scale to 0.0-10.0 scale for better readability
      const avgImportanceScore = ((analysis.averageImportance || 0) * 10).toFixed(1);
      const redundancyScore = ((analysis.redundancyScore || 0) * 10).toFixed(1);

      // Enhanced analysis output
      let analysisText = `Enhanced Conversation Analysis:
- Total messages: ${analysis.totalMessages || 0}
- Message tokens: ${detailedAnalysis.enhancedTokens.messageTokens || 0}
- System context tokens: ${detailedAnalysis.enhancedTokens.systemTokens || 0}
- Tool result tokens: ${detailedAnalysis.enhancedTokens.toolResultTokens || 0}
- Total tokens: ${analysis.totalTokens || 0}
- Average importance: ${avgImportanceScore}/10.0
- Redundancy score: ${redundancyScore}/10.0
- Recommended strategy: ${analysis.recommendedStrategy || 'balanced'}
- Estimated reduction: ${(analysis.estimatedReduction || 0).toFixed(1)}%`;

      // Add breakdown details
      if (detailedAnalysis.enhancedTokens.breakdown && detailedAnalysis.enhancedTokens.breakdown.length > 0) {
        analysisText += '\n\nToken Breakdown:';
        detailedAnalysis.enhancedTokens.breakdown.forEach((line: string) => {
          analysisText += `\n${line}`;
        });
      }

      // Add recommendations
      if (detailedAnalysis.recommendations && detailedAnalysis.recommendations.length > 0) {
        analysisText += '\n\nRecommendations:';
        detailedAnalysis.recommendations.forEach((rec: string) => {
          analysisText += `\n${rec}`;
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: analysisText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error analyzing conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async handleSummarizeSession(args: unknown): Promise<CallToolResult> {
    try {
      const { conversation, level = 'session' } = args as {
        conversation: unknown[];
        level?: 'immediate' | 'session' | 'project';
      };

      const context = await this.parseConversation(conversation);
      const summaries = await this.summarizer.createSummaries(context, level);
      const tokensSaved = summaries?.reduce((sum, s) => sum + (s.tokensSaved || 0), 0) || 0;

      return {
        content: [
          {
            type: 'text',
            text: `Created ${summaries?.length || 0} ${level} summaries, saving approximately ${tokensSaved} tokens`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating summaries: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async handleRollbackPruning(args: unknown): Promise<CallToolResult> {
    try {
      const { pruningId } = args as { pruningId: string };
      const success = await this.pruningEngine.rollback(pruningId);

      return {
        content: [
          {
            type: 'text',
            text: success
              ? `Successfully rolled back pruning operation: ${pruningId}`
              : `Rollback failed: pruning operation ${pruningId} not found`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error during rollback: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async handleConfigurePruning(_args: unknown): Promise<CallToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: 'Configuration updated',
        },
      ],
    };
  }

  private async parseConversation(conversation: unknown[]): Promise<ConversationContext> {
    const messages: ConversationMessage[] = [];
    let totalTokens = 0;
    const activeFiles = new Set<string>();
    
    // Parse each message in the conversation
    for (const msg of conversation) {
      const message = msg as any;
      const messageObj: ConversationMessage = {
        id: message.id || `msg_${Date.now()}_${Math.random()}`,
        timestamp: message.timestamp || Date.now(),
        type: message.type || 'query',
        role: message.role || 'user',
        content: message.content || '',
        metadata: {
          tokenCount: message.metadata?.tokenCount || this.estimateTokens(message.content || ''),
          fileReferences: message.metadata?.fileReferences || [],
          codeBlocks: message.metadata?.codeBlocks || [],
          hasError: message.metadata?.hasError || false,
          toolsUsed: message.metadata?.toolsUsed || [],
        },
      };
      
      messages.push(messageObj);
      totalTokens += messageObj.metadata.tokenCount;
      
      // Track file references
      if (messageObj.metadata.fileReferences) {
        messageObj.metadata.fileReferences.forEach((file: string) => activeFiles.add(file));
      }
    }
    
    return {
      messages,
      totalTokens,
      activeFiles: Array.from(activeFiles),
      sessionStartTime: messages.length > 0 ? messages[0]!.timestamp : Date.now(),
    };
  }
  
  private estimateTokens(text: string): number {
    // Simple token estimation: ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  private async handleTestSimple(_args: unknown): Promise<CallToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: 'Hello World',
        },
      ],
    };
  }


  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new ContextPruningServer();
server.run().catch(error => {
  process.stderr.write(`Server error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});