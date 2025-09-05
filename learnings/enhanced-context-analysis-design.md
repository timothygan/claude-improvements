# Enhanced Context Analysis Design - Claude Code Token Tracking

## Overview
Designing enhanced context analysis for Claude Code sessions to track actual token usage beyond basic message exchanges.

## Research Findings

### Claude Code Context Window Structure
- **Context Window Size**: 200K tokens (500K for Enterprise, 1M for Claude 4 Sonnet via API)
- **Session Management**: 5-hour rolling windows with multiple parallel sessions
- **Auto-compaction**: Triggers at 95% context capacity
- **Built-in Tools**: `/context` command for monitoring token usage

### Major Token Consumers (Currently Missing from Our Implementation)

#### 1. System Context Components
- **System Instructions**: Environment setup, user instructions from CLAUDE.md
- **CLAUDE.md Files**: Up to 5k tokens each, automatically loaded at session start
- **Tool Permissions**: Configuration and permission schemas
- **Session State**: Active files, working directory, git status
- **Environment Variables**: User-specific settings and configurations

#### 2. Tool Result Context (Massive Token Consumer)
- **Read Tool Results**: Complete file contents loaded into context
- **Grep/Glob Results**: Search results with file paths and matching content
- **Bash Command Outputs**: Full command execution results and logs
- **MCP Server Responses**: Complex data structures and API responses
- **Browser Automation Results**: Screenshots, HTML content, console logs
- **Git Operations**: Diff outputs, status reports, commit information

#### 3. Background Processing
- **Auto-compaction Processes**: Summarization when approaching limits
- **Session Resumption**: Conversation summaries for `claude --resume`
- **Codebase Analysis**: File scanning and structure analysis
- **Haiku Generation**: Background functionality (~1 cent/day)

### Current Implementation Gaps

Our existing `ConversationContext` interface:
```typescript
// types.ts:60-66
export interface ConversationContext {
  readonly messages: readonly ConversationMessage[];
  readonly totalTokens: number;
  readonly activeFiles: readonly string[];
  readonly sessionStartTime: number;
  readonly lastPruneTime?: number;
}
```

**Missing Critical Components:**
- No system context tracking
- No tool result history
- No session state management  
- No background processing awareness
- Only tracks basic message tokens (~25 tokens in our test vs real context of 50k+ tokens)

## Enhanced Design Architecture

### 1. Extended ConversationContext Interface

```typescript
export interface EnhancedConversationContext extends ConversationContext {
  readonly systemContext: SystemContext;
  readonly toolResultHistory: ToolResultContext[];
  readonly sessionMetadata: SessionContext;
  readonly backgroundProcessing: BackgroundContext;
  readonly tokenBreakdown: ContextTokenBreakdown;
}
```

### 2. New Context Type Definitions

#### SystemContext Interface
```typescript
export interface SystemContext {
  readonly systemInstructions: SystemInstructions;
  readonly claudeMdContent: ClaudeMdContext;
  readonly toolPermissions: ToolPermissionContext;
  readonly environmentConfig: EnvironmentContext;
  readonly totalTokens: number;
}
```

#### ToolResultContext Interface
```typescript
export interface ToolResultContext {
  readonly toolName: string;
  readonly executionId: string;
  readonly timestamp: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly resultType: ToolResultType;
  readonly content: ToolResultContent;
  readonly relevanceScore: number;
  readonly accessFrequency: number;
}
```

#### SessionContext Interface
```typescript
export interface SessionContext {
  readonly sessionId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly contextWindowUsage: number;
  readonly autoCompactionHistory: CompactionEvent[];
  readonly parallelSessions: SessionReference[];
}
```

### 3. Token Analysis Components

#### ContextTokenBreakdown
```typescript
export interface ContextTokenBreakdown {
  readonly messageTokens: number;          // Basic conversation
  readonly systemTokens: number;           // System instructions, CLAUDE.md
  readonly toolResultTokens: number;       // File contents, command outputs
  readonly mcpResponseTokens: number;      // MCP server responses
  readonly backgroundTokens: number;       // Compaction, summarization
  readonly totalTokens: number;
  readonly breakdown: TokenCategoryBreakdown[];
}
```

## Implementation Strategy

### Phase 1: Interface Updates
- Update `types.ts` with enhanced context interfaces
- Add tool result tracking types
- Create token breakdown analysis structures

### Phase 2: Context Analyzers  
- **FileContentAnalyzer**: Track Read tool results, detect duplicates, measure relevance
- **CommandOutputAnalyzer**: Analyze Bash outputs, identify repetitive results
- **SearchResultAnalyzer**: Track Grep/Glob results, find overlapping searches  
- **MCPResponseAnalyzer**: Monitor MCP data accumulation

### Phase 3: Enhanced Token Counting
- Implement accurate token estimation for tool results
- Create system context token calculation
- Add background processing token tracking
- Integrate with Claude Code's native token monitoring

### Phase 4: Intelligent Pruning Strategies
- **System Context Pruning**: Smart CLAUDE.md management
- **Tool Result Deduplication**: Remove redundant file reads
- **Temporal Relevance**: Prioritize recent vs stale results
- **Context-Aware Summarization**: Preserve essential context

## Key Integration Points

### Claude Code `/context` Command Compatibility
- Parse output from `/context` command to understand current token usage
- Integrate with built-in context monitoring
- Respect Claude Code's 5-hour session windows
- Support auto-compaction triggers at 95% capacity

### Token Estimation Accuracy
- Move beyond simple character-based estimation (`~4 characters per token`)
- Implement content-aware token counting for different data types
- Account for structured data, code syntax, and formatting overhead

## Expected Performance Improvements

### Current State
- **Analyzed Context**: ~25 tokens (basic messages only)
- **Actual Context**: 50k+ tokens (system + tools + background)
- **Coverage**: <1% of actual context
- **Reduction Potential**: 0% (missing 99% of real token usage)

### Enhanced State Target  
- **Analyzed Context**: Full session context including system and tool results
- **Coverage**: 95%+ of actual token usage
- **Reduction Potential**: 30-50% through intelligent pruning
- **Integration**: Compatible with Claude Code's native context management

## Next Steps
1. Implement enhanced `ConversationContext` interface
2. Create tool result analyzers for major token consumers
3. Update context analysis logic to use comprehensive token tracking
4. Test with real Claude Code session data
5. Document token analysis patterns and optimization strategies
