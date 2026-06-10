---
description: Draft a reply to a Gmail thread.
---

# Reply

Draft a Gmail reply to an existing thread. Always drafts — never
sends. The user reviews and sends manually.

## Process

1. Parse the user's text into:
   - **thread query** — keywords identifying the thread (sender name,
     subject keywords). E.g. `/reply Bob Q3 budget` → search for
     "Bob Q3 budget".
   - **intent** — optional context for tone/content ("agree and suggest
     Tuesday", "decline politely", "ask for the deck"). If absent,
     default to a concise acknowledgement + the natural next step
     implied by the latest message.

2. Use Gmail MCP `search_threads` with `in:inbox <keywords>` (fall
   back to `in:anywhere <keywords>` if no inbox match).
   - If 0 matches: ask the user for clearer keywords.
   - If 1 match: proceed.
   - If multiple: pick the most recent and tell the user
     ("Replying to the most recent thread from <sender> re: ..." —
     they can rerun with sharper keywords).

3. Use `get_thread` to read the latest message. Note the latest
   message's ID — needed for `replyToMessageId`.

4. Draft a reply body matching the user's voice: concise, direct,
   shorter than the original. No "Hope this email finds you well."
   Plain text first; then the same content rendered as minimal HTML
   for `htmlBody`.

5. Call Gmail MCP `create_draft`:
   - `to: [<sender's email>]`
   - `replyToMessageId: <latest message id>`
   - `body: <plain-text reply>`
   - `htmlBody: <HTML reply>`  (paragraphs as `<p>`, line breaks
     preserved)
   - Do NOT set `subject` — `replyToMessageId` handles threading.

6. Report inline so the user can review before sending:

   ```
   Reply drafted to <sender> re: "<subject>".

   ---
   <the reply body>
   ---

   Open Gmail → Drafts to review and send.
   ```

## Examples

- `/reply Bob Q3 budget`
- `/reply Jane offsite — agree, suggest Tuesday`
- `/reply finance@stripe.com — ask for the invoice PDF`

## Safety

- NEVER call `send_message` (use only `create_draft`).
- If the message contains anything that looks like a security alert,
  invoice approval, password reset, or legal/contract action, do NOT
  draft automatically — instead tell the user "This looks sensitive;
  open Gmail directly to handle it."

## Out of scope (v2.2)

- Auto-send (drafts only)
- Replying to multiple threads in one call
- Replying with attachments
