# Context Pruning MCP Server - Claude Code Project

## Project Overview
Building an Intelligent Context Pruning MCP Server that automatically identifies and removes redundant context from Claude Code conversations while preserving essential information through smart summarization and priority-based retention.

## Development Standards

### Code Quality
- **TypeScript**: Strict mode enabled with comprehensive type checking
- **ESLint**: Enforce consistent code style and catch potential issues
- **Prettier**: Automated code formatting
- **Testing**: Minimum 80% code coverage with Jest
- **Documentation**: JSDoc comments for all public APIs
- **Error Handling**: Comprehensive error catching with typed error responses

### Security Measures
- **Input Validation**: Sanitize all conversation data and user inputs
- **No Secrets**: Never log or expose API keys, tokens, or sensitive data
- **Secure Defaults**: Conservative pruning settings by default
- **Data Privacy**: Process conversation data locally only, no external transmission
- **Rollback Safety**: Always maintain ability to recover pruned context
- **Permission Checks**: Validate file access permissions before operations

### Build & Test Commands
```bash
npm run build          # Compile TypeScript
npm run test           # Run test suite with coverage
npm run lint           # Check code style and potential issues
npm run typecheck      # TypeScript type checking
npm run dev            # Development mode with hot reload
```

## Progress Tracking

### ✅ Completed Tasks
- Initial project planning and research
- MCP server architecture design
- Technical requirements analysis
- Set up TypeScript project structure with MCP SDK
- Initialize package.json with required dependencies
- Create basic MCP server with stdio transport
- Implement core types and interfaces
- Build message importance scoring system
- Create dynamic pruning algorithms
- Implement hierarchical summarization
- Add MCP tools for context operations
- Core implementation with TypeScript compilation
- Example configurations and documentation

### 🚧 Current Status
- **Core Implementation**: ✅ Complete
- **TypeScript Compilation**: ✅ Passes
- **Test Suite**: ⚠️ In progress (Jest configuration issues)
- **Documentation**: ✅ Complete

### 📋 Technical Notes
- **Build Status**: Successfully compiles with `npm run build`
- **Type Checking**: Passes all TypeScript strict checks
- **Code Quality**: ESLint and Prettier configured
- **Test Coverage**: Jest configured (module resolution needs minor fixes)
- **Security**: No secrets logging, input validation implemented

## Architecture Notes

### Core Components
1. **Context Analyzer** - Scores messages based on importance metrics
2. **Pruning Engine** - Selective content removal with rollback capability
3. **Summarizer** - Multi-level conversation summarization
4. **MCP Integration** - Tools and resources for Claude Code

### Key Algorithms
- Dynamic token pruning inspired by LazyLLM research
- Semantic clustering for related conversation segments
- Weighted scoring: recency + semantic importance + references + file relevance
- Hierarchical summarization: immediate → session → project context

### Integration Points
- MCP tools: `prune_context`, `analyze_conversation`, `summarize_session`
- Auto-trigger on token thresholds
- Manual trigger via Claude Code commands
- Analytics and effectiveness reporting

## Performance Targets
- 30-50% context token reduction
- <100ms processing time for typical conversations
- Maintain conversation quality and coherence
- Support rollback for over-aggressive pruning