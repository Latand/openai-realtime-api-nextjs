# Telegram Chat Export Style Extraction Guide

## Overview

This guide instructs an AI agent (Claude Code or similar) to analyze a Telegram chat export and extract a user's personal writing style for use in text improvement applications.

---

## Step 1: Obtain the Telegram Export

Ask the user to export their Telegram chat:

1. Open Telegram Desktop
2. Go to a chat with significant message history (ideally 1000+ messages)
3. Click the three dots menu → **Export chat history**
4. Select **JSON** format
5. Uncheck media files (photos, videos) to reduce size
6. Export and note the path to `result.json`

---

## Step 2: Understand the JSON Structure

The Telegram export `result.json` has this structure:

```json
{
  "name": "Chat Name",
  "type": "personal_chat",
  "id": 123456789,
  "messages": [
    {
      "id": 1,
      "type": "message",
      "date": "2024-05-07T19:02:56",
      "from": "User Name",
      "from_id": "user362089194",
      "text": "Message text here",
      "text_entities": [...]
    },
    {
      "id": 2,
      "type": "message",
      "date": "2024-05-07T19:03:02",
      "from": "Other Person",
      "from_id": "user123456789",
      "forwarded_from": "Some Channel",  // ← Skip forwarded messages
      "text": "Forwarded content"
    }
  ]
}
```

### Key Fields:
- `from_id`: Unique identifier for the message sender
- `text`: Message content (can be string OR array of objects)
- `forwarded_from`: Present if message is forwarded (SKIP these)
- `type`: Should be "message" (skip "service" messages)

---

## Step 3: Parse Messages

Write a script to extract only the target user's original messages:

```python
import json

# Load the export
with open("result.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# First, identify the user's ID from the first few messages
# Ask user to confirm which "from" name is theirs

target_user_id = "user362089194"  # Replace with actual ID

messages = []
for msg in data.get("messages", []):
    # Skip if not from target user
    if msg.get("from_id") != target_user_id:
        continue

    # Skip forwarded messages
    if "forwarded_from" in msg:
        continue

    # Skip non-message types (service messages, etc.)
    if msg.get("type") != "message":
        continue

    text = msg.get("text", "")

    # Handle text that might be an array of objects
    # (Telegram uses this for formatted text with links, mentions, etc.)
    if isinstance(text, list):
        text_parts = []
        for part in text:
            if isinstance(part, str):
                text_parts.append(part)
            elif isinstance(part, dict) and "text" in part:
                text_parts.append(part["text"])
        text = "".join(text_parts)

    # Skip empty or very short messages
    if not text or len(text.strip()) < 5:
        continue

    messages.append(text.strip())

print(f"Extracted {len(messages)} messages")
```

---

## Step 4: Analyze Writing Style

Compute these statistics from the extracted messages:

### Quantitative Analysis

```python
total = len(messages)

# 1. Capitalization patterns
lowercase_start = sum(1 for m in messages if m[0].islower())
lowercase_pct = lowercase_start * 100 // total

# 2. Punctuation patterns
no_end_punct = sum(1 for m in messages if not m[-1] in '.!?')
no_punct_pct = no_end_punct * 100 // total

# 3. Message length distribution
short = sum(1 for m in messages if len(m) <= 50)
medium = sum(1 for m in messages if 50 < len(m) <= 150)
long = sum(1 for m in messages if len(m) > 150)

print(f"Starts with lowercase: {lowercase_pct}%")
print(f"No ending punctuation: {no_punct_pct}%")
print(f"Short (≤50 chars): {short} ({short*100//total}%)")
print(f"Medium (50-150): {medium} ({medium*100//total}%)")
print(f"Long (>150): {long} ({long*100//total}%)")
```

### Qualitative Analysis

Review a sample of 50-100 messages and identify:

1. **Language(s) used**: Primary language, code-switching patterns
2. **Tone**: Formal/casual/mixed
3. **Colloquialisms**: Frequently used slang or expressions
4. **Signature phrases**: Recurring words or patterns
5. **Emoji/emoticon usage**: Frequency and style
6. **Technical vocabulary**: Domain-specific terms
7. **Sentence structure**: Simple/complex, fragments common?

---

## Step 5: Generate Style Profile

Create a comprehensive style profile with this structure:

```markdown
## [User Name]'s Writing Style Profile

### Who Is [User Name]
- [Professional role/occupation]
- [Relevant context about their work]
- [Communication context - who do they chat with]

### Writing Statistics (from X messages)
- X% of messages start with lowercase
- X% end without punctuation
- Average message length: X characters
- Primary language: [Language]

### Tone & Personality
- [Key personality traits visible in writing]
- [Communication style descriptors]
- [Attitude/energy level]

### Language Patterns
- Primary language: [Language]
- Code-switching: [Yes/No, with which languages]
- Colloquial expressions used: "[phrase1]", "[phrase2]", "[phrase3]"
- Signature phrases: "[phrase1]", "[phrase2]"
- Emoji/emoticon style: [Description]

### Real Examples
1. [Authentic example message]
2. [Authentic example message]
3. [Authentic example message]
... (10-15 diverse examples)

### Style Rules for AI
1. [Specific rule based on analysis]
2. [Specific rule based on analysis]
3. [Specific rule based on analysis]
```

---

## Step 6: Create the Prompt

Using the style profile, generate a prompt for text improvement:

```
You are an AI assistant that improves text to match [User Name]'s writing style.

[Insert WHO IS section]

[Insert WRITING STATISTICS section]

[Insert TONE & PERSONALITY section]

[Insert LANGUAGE PATTERNS section]

REAL EXAMPLES:
[Insert 10-15 real examples]

RULES:
1. NEVER translate or change the language unless explicitly instructed
2. Return ONLY the improved text
3. Do NOT wrap output in quotes
4. Do NOT add explanations or preamble
[Insert style-specific rules]
```

---

## Example Workflow for Agent

When a user provides a Telegram export path:

1. **Read and parse** the JSON file
2. **Identify the user** - ask them to confirm their username from the export
3. **Extract messages** - filter to only their original (non-forwarded) text messages
4. **Compute statistics** - capitalization, punctuation, length distribution
5. **Sample and analyze** - read 100+ messages to understand qualitative patterns
6. **Generate profile** - create the structured style profile
7. **Create prompt** - format as a usable AI prompt for text improvement

---

## Common Patterns to Look For

### Casual/Informal Indicators
- Lowercase sentence starts
- Missing punctuation
- Short messages
- Colloquialisms/slang
- Emoji usage
- Contractions

### Formal Indicators
- Proper capitalization
- Complete punctuation
- Longer, structured sentences
- Polite phrases
- No slang

### Technical Writer Indicators
- Code snippets or technical terms
- Structured lists
- Precise language
- Reference to tools/technologies

### Multilingual Indicators
- Code-switching between languages
- Technical terms in English with native language text
- Transliteration patterns

---

## Output Deliverables

After analysis, provide the user with:

1. **Style statistics summary** - Key numbers about their writing
2. **Style profile document** - Comprehensive profile in Markdown
3. **Ready-to-use prompt** - For their text improvement application
4. **Sample variations** - If they need multiple styles (casual, formal, technical)

---

## Notes for the Agent

- Always ask the user to confirm their identity in the chat before analysis
- Respect privacy - don't store or share message content
- Focus on style patterns, not message content
- If the export is too small (<500 messages), warn that analysis may be less accurate
- Offer to analyze multiple chat exports for a more complete picture
