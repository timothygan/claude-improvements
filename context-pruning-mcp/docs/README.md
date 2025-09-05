# Context Pruning MCP Server

An intelligent context pruning server for Claude Code that automatically optimizes conversation context through smart summarization and priority-based retention, reducing token usage by 30-50% while maintaining conversation quality.

## Features

- **Dynamic Token Pruning**: LazyLLM-inspired selective content removal
- **Hierarchical Summarization**: Multi-level summaries (immediate, session, project)
- **Importance Scoring**: Intelligent message ranking based on recency, semantics, references, and file relevance
- **Rollback Capability**: Undo aggressive pruning when needed
- **Configurable Strategies**: Aggressive, balanced, and conservative pruning approaches
- **Real-time Analytics**: Track pruning effectiveness and token savings

## Installation

1. Clone and build the server:
```bash
git clone <repository-url>
cd context-pruning-mcp
npm install
npm run build
```

2. Add to your Claude Code configuration (`~/.config/claude-code/mcp.json`):
```json
{
  "mcpServers": {
    "context-pruning": {
      "command": "node",
      "args": ["/path/to/context-pruning-mcp/dist/index.js"]
    }
  }
}
```

## Available Tools

### `prune_context`
Intelligently prune conversation context to reduce tokens while preserving important information.

**Parameters:**
- `conversation` (required): Array of conversation messages
- `strategy`: 'aggressive' | 'balanced' | 'conservative' (default: 'balanced')
- `maxTokens`: Maximum tokens to retain after pruning

**Example:**
```javascript
{
  "conversation": [...messages],
  "strategy": "balanced",
  "maxTokens": 75000
}
```

### `analyze_conversation`
Analyze conversation context and provide optimization recommendations.

**Parameters:**
- `conversation` (required): Array of conversation messages

### `summarize_session`
Create hierarchical summaries of conversation segments.

**Parameters:**
- `conversation` (required): Array of conversation messages  
- `level`: 'immediate' | 'session' | 'project' (default: 'session')

### `rollback_pruning`
Rollback the last pruning operation if available.

**Parameters:**
- `pruningId` (required): ID of the pruning operation to rollback

### `configure_pruning`
Update pruning configuration settings.

**Parameters:**
- `strategy`: Default pruning strategy
- `autoTriggerThreshold`: Token count threshold for automatic pruning
- `enableRollback`: Enable rollback functionality

## Pruning Strategies

### Aggressive
- **Max Tokens**: 50,000
- **Preserve Ratio**: 30%
- **Summary Ratio**: 40%
- **Importance Threshold**: 0.7
- **Always Preserve**: errors, code changes

### Balanced (Default)
- **Max Tokens**: 75,000
- **Preserve Ratio**: 50%
- **Summary Ratio**: 30%
- **Importance Threshold**: 0.5
- **Always Preserve**: errors, code changes, file operations

### Conservative
- **Max Tokens**: 100,000
- **Preserve Ratio**: 70%
- **Summary Ratio**: 20%
- **Importance Threshold**: 0.3
- **Always Preserve**: errors, code changes, file operations, tool usage

## Message Importance Scoring

The server calculates importance scores based on four factors:

1. **Recency** (30%): Exponential decay based on message age
2. **Semantic** (25%): Content analysis, keywords, error presence
3. **References** (25%): How often the message is referenced later
4. **File Relevance** (20%): Relevance to currently active files

### Message Types & Weights
- Error messages: 1.0 (highest priority)
- Code changes: 0.9
- File operations: 0.8
- Tool usage: 0.7
- User queries: 0.6
- Success messages: 0.4
- Summaries: 0.3

## Integration Examples

### Manual Pruning
```bash
# In Claude Code
/prune strategy=balanced maxTokens=50000
```

### Automatic Optimization
The server can automatically trigger when conversation exceeds token thresholds, providing seamless context management.

### Analytics & Monitoring
```bash
# View pruning analytics
/analyze
# Example output:
# - Original tokens: 125,000
# - Final tokens: 68,000
# - Reduction: 45.6%
# - Messages removed: 45
# - Summaries created: 8
```

## Development

### Running Tests
```bash
npm test                # Run all tests
npm run test:coverage   # Run tests with coverage report
```

### Code Quality
```bash
npm run lint           # Check code style
npm run typecheck      # TypeScript type checking
npm run build          # Compile TypeScript
```

### Debugging
```bash
npm run dev            # Development mode with hot reload
```

## Performance Targets

- **Token Reduction**: 30-50% for typical conversations
- **Processing Time**: <100ms for conversations under 100k tokens
- **Quality Preservation**: Maintains conversation coherence and context
- **Rollback Support**: Full recovery capability for over-pruning

## Security & Privacy

- **Local Processing**: All conversation data processed locally
- **No External Calls**: No data transmitted to external services  
- **Secure Defaults**: Conservative pruning settings by default
- **Input Validation**: Comprehensive sanitization of all inputs
- **No Secrets Logging**: Never logs API keys, tokens, or sensitive data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass and linting is clean
5. Submit a pull request

## License

MIT License - see LICENSE file for details.