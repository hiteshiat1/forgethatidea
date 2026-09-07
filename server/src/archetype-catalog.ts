import type { Archetype, BuildManifest, ManifestEntity } from '@forge/shared';

export interface ArchetypeDefinition {
  id: Archetype;
  description: string;
  minEntities: number;
  maxEntities: number;
  minScreens: number;
  supportsMultipleRoles: boolean;
  /** What v1 templated generation explicitly does not attempt for this archetype. */
  outOfScope: string[];
}

/**
 * The initial ~5 app archetypes (Epic 4.1) manifests map onto for templated
 * generation. Carried over from the #27 spike's `SpikeManifest` fixtures
 * (crud-tracker, marketplace-listing, booking-scheduler, content-feed,
 * dashboard), which already proved this shape produces well-formed
 * generation prompts — this catalog formalizes the constraints each
 * archetype's generation template is written against, and the `outOfScope`
 * list is an explicit v1 boundary, not an oversight.
 */
export const ARCHETYPES: Record<Archetype, ArchetypeDefinition> = {
  'crud-tracker': {
    id: 'crud-tracker',
    description:
      'A single-role app for creating, listing, editing, and deleting one primary kind of record (habits, tasks, expenses, etc.).',
    minEntities: 1,
    maxEntities: 2,
    minScreens: 1,
    supportsMultipleRoles: false,
    outOfScope: [
      'Multi-user collaboration or sharing between accounts',
      'Complex approval or review workflows',
      'Real-time sync across devices',
    ],
  },
  'marketplace-listing': {
    id: 'marketplace-listing',
    description:
      'Two-sided listings with offers/transactions between distinct roles (buyer/seller, host/guest).',
    minEntities: 2,
    maxEntities: 4,
    minScreens: 2,
    supportsMultipleRoles: true,
    outOfScope: [
      'Real payments or escrow',
      'Search relevance ranking or recommendation',
      'Dispute resolution or moderation tooling',
    ],
  },
  'booking-scheduler': {
    id: 'booking-scheduler',
    description:
      'Time-slot based booking/scheduling of appointments or reservations against a calendar.',
    minEntities: 1,
    maxEntities: 3,
    minScreens: 1,
    supportsMultipleRoles: false,
    outOfScope: [
      'Real calendar sync (Google/Outlook)',
      'Recurring/repeating appointment rules',
      'Timezone-aware multi-region scheduling',
    ],
  },
  'content-feed': {
    id: 'content-feed',
    description:
      'A browsable feed of user-generated content with a detail view and lightweight engagement actions (comment, like).',
    minEntities: 1,
    maxEntities: 3,
    minScreens: 2,
    supportsMultipleRoles: false,
    outOfScope: [
      'Content moderation or spam detection',
      'Personalized ranking/algorithmic feed ordering',
      'Media upload/transcoding pipelines',
    ],
  },
  dashboard: {
    id: 'dashboard',
    description:
      'A metrics/reporting overview surfacing aggregated numbers and generated reports at a glance.',
    minEntities: 1,
    maxEntities: 4,
    minScreens: 1,
    supportsMultipleRoles: false,
    outOfScope: [
      'Real data source integrations (analytics platforms, warehouses)',
      'Custom report builders',
      'Scheduled/emailed report delivery',
    ],
  },
};

export interface ArchetypeChoice {
  archetype: Archetype;
  reason: string;
}

function hasFieldType(entities: ManifestEntity[], type: string): boolean {
  return entities.some((e) => e.fields.some((f) => f.type === type));
}

function matchesAny(haystack: string[], needles: string[]): boolean {
  const joined = haystack.join(' ').toLowerCase();
  return needles.some((n) => joined.includes(n));
}

/**
 * Deterministic manifest -> best-fit archetype mapping (Epic 4.1). A set of
 * ordered heuristic rules over shape (entity/screen/role counts) and
 * vocabulary (key action / entity name wording) — checked most-specific
 * first so a manifest that could loosely match several archetypes lands on
 * the one its language most clearly signals, falling back to crud-tracker
 * (the simplest, most general shape) rather than ever failing to choose.
 */
export function chooseArchetype(manifest: BuildManifest): ArchetypeChoice {
  const { entities, screens, roles, keyActions } = manifest;
  const entityNames = entities.map((e) => e.name.toLowerCase());

  if (
    roles.length >= 2 &&
    (matchesAny(entityNames, ['listing', 'offer', 'order']) || entities.length >= 2)
  ) {
    return {
      archetype: 'marketplace-listing',
      reason: 'Multiple roles plus listing/offer-shaped entities indicate a two-sided marketplace.',
    };
  }

  if (
    hasFieldType(entities, 'date') &&
    (matchesAny(entityNames, ['appointment', 'booking', 'reservation', 'slot']) ||
      matchesAny(keyActions, ['book', 'schedule', 'reserve']))
  ) {
    return {
      archetype: 'booking-scheduler',
      reason: 'A date-bearing entity plus booking/scheduling language indicates a scheduler.',
    };
  }

  if (
    screens.length >= 2 &&
    matchesAny(keyActions, ['comment', 'like', 'share', 'follow', 'post'])
  ) {
    return {
      archetype: 'content-feed',
      reason: 'Multiple screens plus social/engagement actions indicate a browsable content feed.',
    };
  }

  if (
    matchesAny(entityNames, ['metric', 'report', 'kpi', 'dashboard']) ||
    matchesAny(keyActions, ['view metrics', 'export report', 'view dashboard'])
  ) {
    return {
      archetype: 'dashboard',
      reason: 'Metric/report-shaped entities or reporting actions indicate a dashboard overview.',
    };
  }

  return {
    archetype: 'crud-tracker',
    reason:
      'No stronger signal for another archetype; a single-role create/list/edit/delete app is the best general fit.',
  };
}
