<!-- https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache -->
> ## Documentation Index
> Fetch the complete documentation index at: /docs/llms.txt
> Use this file to discover all available pages before exploring further.
Skip to main content
🎉 MiniMax H3 is now available! A new-generation open general-purpose multimodal video model. ➔ View docs.
MiniMax API Docs home page
Search...
⌘K
Search...
Navigation
Text
Explicit Prompt Caching (Anthropic API)
Developer Guides
API
Token Plan
Pricing
Release Notes
Developer Program
Text
# Explicit Prompt Caching (Anthropic API)
Copy pageCopy page
MiniMax supports Anthropic API compatible caching that is managed through explicit cache_control settings.
Copy pageCopy page
Quick Start
Here’s a quick example of how to implement prompt caching in the Anthropic-compatible API using a `cache_control` block:
Python
import anthropic
client = anthropic.Anthropic(
base_url="https://api.minimax.io/anthropic",
api_key="<your API Key>" # Replace with your MiniMax API Key
response = client.messages.create(
model="MiniMax-M2.7",
max_tokens=1024,
system=[
"type": "text",
"text": "You are an AI assistant tasked with analyzing literary works. Your goal is to provide insightful commentary on themes, characters, and writing style.\n",
"type": "text",
"text": "<the entire contents of 'Pride and Prejudice'>",
"cache_control": {"type": "ephemeral"}
messages=[{"role": "user", "content": "Analyze the major themes in 'Pride and Prejudice'."}],
print(response.usage.model_dump_json())
# Make another call with the same cached content
# Only the user message needs to change
response = client.messages.create(.....)
print(response.usage.model_dump_json())
JSON
{"cache_creation_input_tokens":188086,"cache_read_input_tokens":0,"input_tokens":21,"output_tokens":393}
{"cache_creation_input_tokens":0,"cache_read_input_tokens":188086,"input_tokens":21,"output_tokens":393}
In this example, the entire text of “Pride and Prejudice” is cached using the `cache_control` parameter. This enables reuse of the large text across multiple API calls without reprocessing it each time. By changing only the user message, you can ask various questions about the book while utilizing the cached content, resulting in faster responses and reduced costs.
How Prompt Caching Works
When you send a request with prompt caching enabled:
1. The system checks if the prompt prefix before the specified cache breakpoint (cache_control) has been cached from a previous request.
2. If found, it uses the cached version, significantly reducing processing time and costs.
3. If not found, it processes the full prompt and caches it when generating the response.
This is especially useful for:
- Prompts with many examples
- Large amounts of context or background information
- Repetitive tasks with consistent instructions
- Long multi-turn conversations
Cached content has a **lifetime of 5 minutes**. Each time the cached content is hit, the cache lifetime is automatically refreshed at no additional cost.
Supported Models and Pricing
Prompt caching introduces a differentiated pricing structure. The table below shows the price per million tokens for each supported model:
| Model | Input | Output | Prompt caching Read | Prompt caching Write |
| **MiniMax-M2.7** | $0.3 / M tokens | $1.2 / M tokens | $0.06 / M tokens | $0.375 / M tokens |
| **MiniMax-M2.7-highspeed**
Same performance, faster and more efficient | $0.3 / M tokens | $2.4 / M tokens | $0.06 / M tokens | $0.375 / M tokens |
| **MiniMax-M2.5** | $0.3 / M tokens | $1.2 / M tokens | $0.03 / M tokens | $0.375 / M tokens |
| **MiniMax-M2.5-highspeed**
Same performance, faster and more efficient | $0.3 / M tokens | $2.4 / M tokens | $0.03 / M tokens | $0.375 / M tokens |
| **MiniMax-M2.1** | $0.3 / M tokens | $1.2 / M tokens | $0.03 / M tokens | $0.375 / M tokens |
| **MiniMax-M2.1-highspeed**
Faster and more efficient | $0.3 / M tokens | $2.4 / M tokens | $0.03 / M tokens | $0.375 / M tokens |
| **MiniMax-M2 / M2-Stable** | $0.3 / M tokens | $1.2 / M tokens | $0.03 / M tokens | $0.375 / M tokens |
The table above reflects the following prompt caching pricing rules:
- Cache write tokens and cache read tokens follow the prices shown in the table
How to Implement Prompt Caching
Structuring Your Prompt
Place static, reusable content (tool definitions, system instructions, examples, etc.) at the beginning of your prompt. Mark the end of the cacheable content using the `cache_control` parameter. Cache prefixes are created in the following order: `tools` → `system` → `messages`. This order forms a hierarchy where each level builds upon the previous ones.
Automatic Prefix Checking
You can use just one cache breakpoint at the end of your static content, and the system will automatically find the longest matching prefix. **Three core principles:**
1. **Cache content is cumulative**: When you mark a block with `cache_control`, the cache content is generated from all previous blocks in sequence. This means each cache depends on all content that came before it.
2. **Forward sequential checking**: The system checks for cache hits by working forward from the explicit cache breakpoint, ensuring the longest possible cache is hit.
3. **20-block lookback window**: The system checks up to 20 blocks before each explicit cache breakpoint. If no match is found after checking 20 blocks, it stops and moves to the previous explicit breakpoint (if any).
**Example:** If you set `cache_control` at block 30 and make repeated requests:
1. If no block content is modified, the system will hit the cache for all content from blocks 1-30.
2. If block 25 is modified, the system searches forward from block 30 until it matches the cache at block 24, so blocks 1-24 will hit the cache.
3. If block 5 is modified, the system searches forward from block 30 and still finds no match at block 11, so the cache becomes invalid for this request.
What Can Be Cached
Most blocks in the request can be designated for caching with `cache_control`, including:
- **Tools**: Tool definitions in the `tools` array
- **System messages**: Content blocks in the `system` array
- **Text messages**: Content blocks in the `messages.content` array, for both user and assistant turns
- **Tool use and tool results**: Tool_use and tool_result types in content blocks in the `messages.content` array, for both user and assistant turns
Mark any of these elements with `cache_control` to enable caching for that portion of the request.
Cache Invalidation
Modifications to cached content can invalidate some or all of the cache. As described in Structuring Your Prompt, the cache follows the hierarchy: `tools` → `system` → `messages`. Changes at each level invalidate that level and all subsequent levels.
Cache Performance
Monitor cache performance using the following API response fields in the `usage` object (or in the `message_start` event when streaming):
- `cache_creation_input_tokens`: Number of tokens written to the cache when creating a new cache entry.
- `cache_read_input_tokens`: Number of tokens retrieved from the cache for this request.
- `input_tokens`: Number of input tokens not read from or used to create a cache (i.e., tokens after the last cache breakpoint).
**Understanding Token Composition**To calculate total input tokens:
total_input_tokens = cache_read_input_tokens + cache_creation_input_tokens + input_tokens
**Breakdown by position:**
- `cache_read_input_tokens`: Tokens before the breakpoint, already cached (reads)
- `cache_creation_input_tokens`: Tokens before the breakpoint, being cached now (writes)
- `input_tokens`: Tokens after the last breakpoint (not eligible for caching)
**Example:** A request with 100,000 tokens of cached content (read from cache), 0 tokens of new content being cached, and 50 tokens in the user message (after the cache breakpoint):
- `cache_read_input_tokens`: 100,000
- `cache_creation_input_tokens`: 0
- `input_tokens`: 50
- **Total input tokens**: 100,050 tokens
This is important for understanding both costs and rate limits. When using caching effectively, `input_tokens` will typically be much smaller than your total input.
Common Issues
If you’re experiencing unexpected caching behavior:
- **Content consistency**: Verify that cached sections are identical across calls and marked with `cache_control` in the same locations
- **Cache expiration**: Confirm that calls are made within the cache lifetime (5 minutes)
- **Block count limit**: For prompts with more than 20 content blocks, add additional `cache_control` parameters to ensure all content can be cached (the system automatically checks approximately 20 blocks before each breakpoint)
- **Inactive cache breakpoints**: A call supports up to 4 `cache_control` parameters. If more than 4 are specified, only the most recent 4 (from back to front) will be used
More Examples
The following code examples showcase various prompt caching patterns and demonstrate how to implement caching in different scenarios:
Large context caching example
Python
import anthropic
client = anthropic.Anthropic()
response = client.messages.create(
model="MiniMax-M2.7",
max_tokens=1024,
system=[
"type": "text",
"text": "You are an AI assistant tasked with analyzing legal documents."
"type": "text",
"text": "Here is the full text of a complex legal agreement: [Insert full text of a 50-page legal agreement here]",
"cache_control": {"type": "ephemeral"}
messages=[
"role": "user",
"content": "What are the key terms and conditions in this agreement?"
print(response.model_dump_json())
This example demonstrates basic prompt caching by caching the full text of the legal agreement while keeping the user instruction uncached.**First request:**
- `input_tokens`: Tokens in the user message only
- `cache_creation_input_tokens`: Tokens in the entire system message, including the legal document
- `cache_read_input_tokens`: 0 (no cache hit on first request)
**Subsequent requests within cache lifetime:**
- `cache_creation_input_tokens`: 0 (no new cache creation)
- `cache_read_input_tokens`: Tokens in the entire cached system message
Caching tool definitions
Python
import anthropic
client = anthropic.Anthropic()
response = client.messages.create(
model="MiniMax-M2.7",
max_tokens=1024,
tools=[
"name": "get_weather",
"description": "Get the current weather in a given location",
"input_schema": {
"type": "object",
"properties": {
"location": {
"type": "string",
"description": "The city and state, e.g. San Francisco, CA"
"unit": {
"type": "string",
"enum": ["celsius", "fahrenheit"],
"description": "The unit of temperature, either 'celsius' or 'fahrenheit'"
"required": ["location"]
# More tools
"name": "get_time",
"description": "Get the current time in a given time zone",
"input_schema": {
"type": "object",
"properties": {
"timezone": {
"type": "string",
"description": "The IANA time zone name, e.g. America/Los_Angeles"
"required": ["timezone"]
"cache_control": {"type": "ephemeral"}
messages=[
"role": "user",
"content": "What's the weather and time in New York?"
print(response.model_dump_json())
This example demonstrates caching tool definitions.The `cache_control` parameter is placed on the final tool (`get_time`) to designate all tools as part of the static prefix.All tool definitions, including `get_weather` and any other tools defined before `get_time`, will be cached as a single prefix.This approach is ideal when you have a consistent set of tools to reuse across multiple requests without reprocessing them each time.**First request:**
- `input_tokens`: Tokens in the user message
- `cache_creation_input_tokens`: Tokens in all tool definitions and system prompt
- `cache_read_input_tokens`: Tokens in all cached tool definitions and system prompt
Ongoing multi-turn conversation
Python
import anthropic
client = anthropic.Anthropic()
response = client.messages.create(
model="MiniMax-M2.7",
max_tokens=1024,
system=[
"type": "text",
"text": "...long system prompt",
"cache_control": {"type": "ephemeral"}
messages=[
# ...long conversation history
"role": "user",
"content": [
"type": "text",
"text": "Hello, can you tell me more about the solar system?",
"role": "assistant",
"content": "Certainly! The solar system is the collection of celestial bodies that orbit our Sun. It consists of eight planets, numerous moons, asteroids, comets, and other objects. The planets, in order from closest to farthest from the Sun, are: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune. Each planet has its own unique characteristics and features. Is there a specific aspect of the solar system you'd like to know more about?"
"role": "user",
"content": [
"type": "text",
"text": "Good to know."
"type": "text",
"text": "Tell me more about Mars.",
"cache_control": {"type": "ephemeral"}
print(response.model_dump_json())
This example demonstrates prompt caching in a multi-turn conversation.During each turn, we mark the final block of the final message with `cache_control` to enable incremental caching of the conversation. The system automatically looks up and uses the longest previously cached prefix for subsequent messages. Blocks previously marked with `cache_control` don’t need to be marked again—they will still result in cache hits (and cache refreshes) if accessed within 5 minutes.Note that `cache_control` is also placed on the system message. This ensures that if it gets evicted from the cache (after not being used for more than 5 minutes), it will be re-cached on the next request.This approach is ideal for maintaining context in ongoing conversations without repeatedly processing the same information.When set up correctly, you should see the following in the usage response for each request:
- `input_tokens`: Tokens in the new user message (typically minimal)
- `cache_creation_input_tokens`: Tokens in the new assistant and user turns
- `cache_read_input_tokens`: Tokens in the conversation up to the previous turn
Comprehensive use: Multiple cache breakpoints
Python
import anthropic
client = anthropic.Anthropic()
response = client.messages.create(
model="MiniMax-M2.7",
max_tokens=1024,
tools=[
"name": "search_documents",
"description": "Search through the knowledge base",
"input_schema": {
"type": "object",
"properties": {
"query": {
"type": "string",
"description": "Search query"
"required": ["query"]
"name": "get_document",
"description": "Retrieve a specific document by ID",
"input_schema": {
"type": "object",
"properties": {
"doc_id": {
"type": "string",
"description": "Document ID"
"required": ["doc_id"]
"cache_control": {"type": "ephemeral"}
system=[
"type": "text",
"text": "You are a helpful research assistant with access to a document knowledge base.\n\n# Instructions\n- Always search for relevant documents before answering\n- Provide citations for your sources\n- Be objective and accurate in your responses\n- If multiple documents contain relevant information, synthesize them\n- Acknowledge when information is not available in the knowledge base",
"cache_control": {"type": "ephemeral"}
"type": "text",
"text": "# Knowledge Base Context\n\nHere are the relevant documents for this conversation:\n\n## Document 1: Solar System Overview\nThe solar system consists of the Sun and all objects that orbit it...\n\n## Document 2: Planetary Characteristics\nEach planet has unique features. Mercury is the smallest planet...\n\n## Document 3: Mars Exploration\nMars has been a target of exploration for decades...\n\n[Additional documents...]",
"cache_control": {"type": "ephemeral"}
messages=[
"role": "user",
"content": "Can you search for information about Mars rovers?"
"role": "assistant",
"content": [
"type": "tool_use",
"id": "tool_1",
"name": "search_documents",
"input": {"query": "Mars rovers"}
"role": "user",
"content": [
"type": "tool_result",
"tool_use_id": "tool_1",
"content": "Found 3 relevant documents: Document 3 (Mars Exploration), Document 7 (Rover Technology), Document 9 (Mission History)"
"role": "assistant",
"content": [
"type": "text",
"text": "I found 3 relevant documents about Mars rovers. Let me get more details from the Mars Exploration document."
"role": "user",
"content": [
"type": "text",
"text": "Yes, please tell me about the Perseverance rover specifically.",
"cache_control": {"type": "ephemeral"}
print(response.model_dump_json())
This comprehensive example demonstrates how to use all 4 available cache breakpoints to optimize different parts of your prompt:This pattern is especially powerful for:
- RAG applications with large document contexts
- Agent systems that use multiple tools
- Long-running conversations that maintain context
- Applications that need to optimize different parts of the prompt independently
