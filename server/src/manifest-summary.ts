import type { BuildManifest } from '@forge/shared';
import type { SessionCard } from './phase-gates.js';

const CARD_STATUS_LABEL: Record<SessionCard['status'], string> = {
  draft: 'in progress',
  refined: 'in progress',
  locked: 'ready',
  live: 'ready',
};

function cardStatusLine(label: string, cards: SessionCard[], type: string): string {
  const card = cards.find((c) => c.type === type);
  const status = card ? CARD_STATUS_LABEL[card.status] : 'not started';
  return `${label}: ${status}`;
}

/**
 * Manifest → human-readable summary (Epic 2.14): a plain-language recap of
 * what the agent has decided to build so far, for a non-technical user to
 * sanity-check at any point in the conversation.
 *
 * Only reports on what's actually captured in the manifest (#32) and card
 * presence/status (#22/#29) — cost figures and marketing copy don't exist
 * anywhere in the codebase yet (that content generation is later Epic 3/4
 * work), so this deliberately never fabricates numbers or copy, only whether
 * that work has started.
 */
export function summarizeManifest(
  manifest: BuildManifest | null,
  cards: SessionCard[],
): string | null {
  if (!manifest) {
    return null;
  }

  const lines = [
    `${manifest.productName} — for ${manifest.icp}`,
    `Entities: ${manifest.entities.map((e) => e.name).join(', ')}`,
    `Screens: ${manifest.screens.map((s) => s.name).join(', ')}`,
    `Key actions: ${manifest.keyActions.join(', ')}`,
    cardStatusLine('Cost estimate', cards, 'cost'),
    cardStatusLine('Marketing plan', cards, 'marketing'),
  ];

  return lines.join('\n');
}
