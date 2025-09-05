# Context Pruning MCP Server - Usage Guide

## CRITICAL: Tool Result Content Requirements

**The enhanced context-pruner can only analyze what you provide to it.** If you pass message summaries instead of full tool result content, the analysis will be severely inaccurate and miss 80-95% of actual token usage.

## ❌ WRONG Usage Examples

### Incorrect: Truncated Tool Results
```json
{
  "conversation": [
    {"role": "user", "content": "Read the config file"},
    {"role": "assistant", "content": "I'll read the config file for you"},
    {"role": "tool", "tool_name": "Read", "content": "Config file contents..."}
  ]
}
```
**Result**: Inaccurate analysis showing ~50 tokens instead of actual ~2000+ tokens

### Incorrect: Missing Tool Results
```json
{
  "conversation": [
    {"role": "user", "content": "Analyze the codebase"},
    {"role": "assistant", "content": "I analyzed 15 files and found several issues"}
  ]
}
```
**Result**: Analysis shows basic message tokens only, missing massive tool result consumption

## ✅ CORRECT Usage Examples

### Correct: Full Tool Result Content
```json
{
  "conversation": [
    {"role": "user", "content": "Read the config file"},
    {"role": "assistant", "content": "I'll read the config file for you"},
    {
      "role": "tool",
      "tool_name": "Read",
      "content": "{\n  \"name\": \"my-app\",\n  \"version\": \"1.0.0\",\n  \"dependencies\": {\n    \"express\": \"^4.18.0\",\n    \"typescript\": \"^5.0.0\",\n    ...[COMPLETE FILE CONTENT]...\n  }\n}",
      "timestamp": 1704067200
    }
  ]
}
```
**Result**: Accurate analysis including full file content token usage

### Correct: Multiple Tool Results with Full Content
```json
{
  "conversation": [
    {"role": "user", "content": "Search for error handling in the codebase"},
    {"role": "assistant", "content": "I'll search for error handling patterns"},
    {
      "role": "tool", 
      "tool_name": "Bash",
      "content": "$ ls src/\ncomponents/  services/  utils/  types/  index.ts",
      "timestamp": 1704067200
    },
    {
      "role": "tool",
      "tool_name": "Grep",
      "content": "src/services/api.ts:15:  } catch (error) {\nsrc/services/api.ts:16:    console.error('API Error:', error);\nsrc/utils/logger.ts:8:export const handleError = (error: Error) => {\n...[COMPLETE SEARCH RESULTS]...",
      "timestamp": 1704067201
    },
    {
      "role": "tool",
      "tool_name": "Read", 
      "content": "// src/services/api.ts\nimport axios from 'axios';\n\nexport class ApiService {\n  async fetchData() {\n    try {\n      const response = await axios.get('/api/data');\n      return response.data;\n    } catch (error) {\n      console.error('API Error:', error);\n      throw error;\n    }\n  }\n}\n...[COMPLETE FILE CONTENT]...",
      "timestamp": 1704067202
    }
  ]
}
```

## Tool-Specific Content Requirements

### Read Tool Results
- **Must include**: Complete file contents as returned by the Read tool
- **Token impact**: Typically 1000-10000+ tokens per file
- **Example**: Full source code, configuration files, documentation

### Bash Command Results  
- **Must include**: Complete terminal output including command and response
- **Token impact**: 50-5000+ tokens depending on command
- **Example**: Directory listings, git status, build outputs, test results

### Grep/Search Results
- **Must include**: All matching lines with file paths and line numbers
- **Token impact**: 100-3000+ tokens depending on matches
- **Example**: Code search results, file pattern matches

### Write Tool Results
- **Must include**: Confirmation message and any generated content
- **Token impact**: 10-1000+ tokens depending on operation
- **Example**: File creation confirmations, generated code

## Conversation Structure Format

```json
{
  "conversation": [
    {
      "role": "user|assistant|tool",
      "content": "FULL_CONTENT_HERE", 
      "tool_name": "Read|Bash|Grep|Write|TodoWrite|etc", // for tool results
      "timestamp": 1704067200, // Unix timestamp (optional)
      "metadata": { // optional
        "file_path": "/path/to/file", 
        "command": "command executed",
        "duration": 1500 // milliseconds
      }
    }
  ]
}
```

## Real-World Token Breakdown

### Typical Claude Code Session (50k+ tokens)
- **User/Assistant Messages**: 15-25% (~7,500-12,500 tokens)
- **Tool Results**: 60-80% (~30,000-40,000 tokens)
  - File reads: 20,000+ tokens
  - Command outputs: 5,000+ tokens  
  - Search results: 5,000+ tokens
- **System Context**: 5-15% (~2,500-7,500 tokens)
  - CLAUDE.md files: 3,000+ tokens
  - Environment variables: 1,000+ tokens
  - Tool permissions: 500+ tokens

### Analysis Impact
- **With truncated data**: Shows ~500 tokens, 0% reduction potential
- **With full data**: Shows ~50,000 tokens, 30-50% reduction potential

## Integration with Claude Code Sessions

To get full session analysis, you need to capture:

1. **All tool invocations and their complete results**
2. **System context** (CLAUDE.md content, environment variables)
3. **Background processing** (auto-compaction, summaries)
4. **Session metadata** (duration, context window usage)

## Common Mistakes to Avoid

1. **Summarizing tool results**: Never truncate or paraphrase tool outputs
2. **Missing timestamps**: Reduces effectiveness of staleness analysis
3. **Excluding system context**: Misses 15-25% of actual token usage
4. **Batch processing multiple sessions**: Analyze individual sessions for accuracy
5. **Not including metadata**: Reduces optimization recommendation quality

## Expected Performance

### Before Enhancement (Basic Message Analysis)
- Coverage: <1% of actual token usage
- Analysis: ~25-100 tokens detected
- Reduction: 0% (missing real token consumers)

### After Enhancement (Full Context Analysis)  
- Coverage: 95%+ of actual token usage
- Analysis: 10,000-100,000+ tokens detected
- Reduction: 30-50% through intelligent pruning

## Best Practices

1. **Always include complete tool results** - this is 80% of your token usage
2. **Use timestamps** - enables staleness detection and temporal analysis
3. **Include file paths** - helps with duplicate detection and relevance scoring
4. **Provide session metadata** - improves context-aware recommendations
5. **Test with real data** - use actual Claude Code session exports for accuracy

## Tool Selection Guide

- **`analyze_conversation`**: Use for understanding token breakdown and getting optimization recommendations
- **`prune_context`**: Use for actually reducing context size before hitting limits  
- **`summarize_session`**: Use for creating compressed session overviews
- **`rollback_pruning`**: Use if pruning was too aggressive and you need to restore content

Remember: The quality of analysis is directly proportional to the completeness of data you provide.