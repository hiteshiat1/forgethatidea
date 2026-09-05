/**
 * Server-side chat message shape stored in `sessions.chat` (JSONB, #22).
 * Mirrors the frontend's `ChatMessage` (app/src/components/ChatPane.tsx) by
 * convention — kept as a separate type rather than importing from
 * `@forge/app` (server must never depend on the frontend package).
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
}
