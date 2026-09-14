import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

export interface MarkdownMessageProps {
  text: string;
}

/**
 * Renders agent chat text as markdown (lists, bold/italic, code blocks,
 * links) instead of a flat pre-wrapped string — replies routinely include
 * markdown syntax (e.g. `- ` bullets, `**bold**`) that previously rendered
 * as raw asterisks/dashes. The text is LLM-generated and therefore
 * untrusted input, so the HTML `marked` produces is run through
 * `DOMPurify.sanitize` (stripping scripts/event handlers/etc.) before it is
 * ever passed to `dangerouslySetInnerHTML` — never render `rawHtml` itself.
 * `marked`'s GFM mode adds table/strikethrough support and `breaks: true`
 * turns single newlines into `<br>` so short conversational replies don't
 * require markdown's usual blank-line-between-paragraphs convention to read
 * right.
 */
export function MarkdownMessage({ text }: MarkdownMessageProps) {
  const sanitizedHtml = useMemo(() => {
    const rawHtml = marked.parse(text, { async: false });
    return DOMPurify.sanitize(rawHtml);
  }, [text]);

  return (
    <span className="chat-message__markdown" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
  );
}
