import type { BuildManifest } from '@forge/shared';

/**
 * Generation quality eval fixtures (Epic 4.16): 12 hand-written, realistic
 * manifests spanning all 5 archetypes (#62), used to score the generation
 * pipeline's real compile rate, contract compliance, and archetype fit
 * nightly. More than one fixture per archetype where the archetype's shape
 * varies meaningfully (single vs. multi-role, few vs. many entities), since
 * a single fixture per archetype wouldn't catch shape-specific regressions.
 */
export const FIXTURE_MANIFESTS: BuildManifest[] = [
  {
    schemaVersion: 1,
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [
      {
        name: 'Habit',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'frequency', type: 'enum', enumValues: ['daily', 'weekly'] },
          { name: 'streak', type: 'number' },
        ],
      },
    ],
    screens: [
      { name: 'Habit list', purpose: 'see all habits and current streaks' },
      { name: 'Habit detail', purpose: 'edit a habit and log completion' },
    ],
    roles: ['user'],
    keyActions: ['create habit', 'log completion', 'edit habit', 'delete habit'],
    branding: { accentColor: '#2E7D32', tone: 'encouraging, minimal' },
    references: { researchCardIds: [] },
    archetype: 'crud-tracker',
  },
  {
    schemaVersion: 1,
    productName: 'ExpenseJar',
    icp: 'freelancers tracking personal business expenses',
    entities: [
      {
        name: 'Expense',
        fields: [
          { name: 'description', type: 'string' },
          { name: 'amount', type: 'number' },
          { name: 'category', type: 'enum', enumValues: ['travel', 'software', 'meals', 'other'] },
        ],
      },
    ],
    screens: [{ name: 'Expense list', purpose: 'view and add expenses' }],
    roles: ['user'],
    keyActions: ['add expense', 'delete expense', 'filter by category'],
    branding: { accentColor: '#1565C0', tone: 'calm, trustworthy' },
    references: { researchCardIds: [] },
    archetype: 'crud-tracker',
  },
  {
    schemaVersion: 1,
    productName: 'GearSwap',
    icp: 'hobbyist photographers buying/selling used gear',
    entities: [
      {
        name: 'Listing',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'price', type: 'number' },
          { name: 'condition', type: 'enum', enumValues: ['new', 'used', 'for-parts'] },
        ],
      },
      {
        name: 'Offer',
        fields: [
          { name: 'amount', type: 'number' },
          { name: 'status', type: 'enum', enumValues: ['pending', 'accepted', 'declined'] },
        ],
      },
    ],
    screens: [
      { name: 'Browse listings', purpose: 'search/filter available gear' },
      { name: 'Listing detail', purpose: 'view a listing and make an offer' },
    ],
    roles: ['buyer', 'seller'],
    keyActions: ['create listing', 'make offer', 'accept offer', 'decline offer'],
    branding: { accentColor: '#EF6C00', tone: 'trustworthy, community-driven' },
    references: { researchCardIds: [] },
    archetype: 'marketplace-listing',
  },
  {
    schemaVersion: 1,
    productName: 'ShiftMarket',
    icp: 'restaurant workers trading shifts with coworkers',
    entities: [
      {
        name: 'Shift',
        fields: [
          { name: 'startTime', type: 'date' },
          { name: 'role', type: 'string' },
        ],
      },
      {
        name: 'TradeRequest',
        fields: [{ name: 'status', type: 'enum', enumValues: ['open', 'claimed'] }],
      },
    ],
    screens: [
      { name: 'Open shifts', purpose: 'browse shifts others want to trade' },
      { name: 'My shifts', purpose: 'manage your own shifts and requests' },
    ],
    roles: ['employee', 'manager'],
    keyActions: ['post trade request', 'claim shift', 'approve trade'],
    branding: { accentColor: '#6A1B9A', tone: 'practical, no-nonsense' },
    references: { researchCardIds: [] },
    archetype: 'marketplace-listing',
  },
  {
    schemaVersion: 1,
    productName: 'ChairTime',
    icp: 'independent hairdressers managing their own bookings',
    entities: [
      {
        name: 'Appointment',
        fields: [
          { name: 'clientName', type: 'string' },
          { name: 'service', type: 'string' },
          { name: 'startTime', type: 'date' },
        ],
      },
    ],
    screens: [
      { name: 'Calendar', purpose: 'see upcoming appointments' },
      { name: 'Book appointment', purpose: 'schedule a new appointment' },
    ],
    roles: ['stylist'],
    keyActions: ['book appointment', 'cancel appointment', 'reschedule'],
    branding: { accentColor: '#D81B60', tone: 'warm, personal' },
    references: { researchCardIds: [] },
    archetype: 'booking-scheduler',
  },
  {
    schemaVersion: 1,
    productName: 'CourtTime',
    icp: 'amateur tennis players booking shared club courts',
    entities: [
      {
        name: 'Booking',
        fields: [
          { name: 'courtNumber', type: 'number' },
          { name: 'startTime', type: 'date' },
        ],
      },
    ],
    screens: [{ name: 'Court calendar', purpose: 'see and reserve open court slots' }],
    roles: ['member'],
    keyActions: ['reserve slot', 'cancel reservation'],
    branding: { accentColor: '#2E7D32', tone: 'energetic, simple' },
    references: { researchCardIds: [] },
    archetype: 'booking-scheduler',
  },
  {
    schemaVersion: 1,
    productName: 'RecipeReel',
    icp: 'home cooks sharing weeknight recipes',
    entities: [
      {
        name: 'Post',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'body', type: 'string' },
        ],
      },
      { name: 'Comment', fields: [{ name: 'body', type: 'string' }] },
    ],
    screens: [
      { name: 'Feed', purpose: 'browse recent recipe posts' },
      { name: 'Post detail', purpose: 'read one post and its comments' },
    ],
    roles: ['user'],
    keyActions: ['create post', 'comment on post', 'like post'],
    branding: { accentColor: '#EF6C00', tone: 'friendly, appetizing' },
    references: { researchCardIds: [] },
    archetype: 'content-feed',
  },
  {
    schemaVersion: 1,
    productName: 'DevNotes',
    icp: 'engineers sharing short technical write-ups',
    entities: [
      {
        name: 'Note',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'body', type: 'string' },
        ],
      },
    ],
    screens: [
      { name: 'Feed', purpose: 'browse recent notes' },
      { name: 'Note detail', purpose: 'read one note and its comments' },
    ],
    roles: ['user'],
    keyActions: ['create note', 'comment on note', 'follow author'],
    branding: { accentColor: '#37474F', tone: 'technical, minimal' },
    references: { researchCardIds: [] },
    archetype: 'content-feed',
  },
  {
    schemaVersion: 1,
    productName: 'ClinicPulse',
    icp: 'clinic managers tracking daily patient volume',
    entities: [
      {
        name: 'Metric',
        fields: [
          { name: 'label', type: 'string' },
          { name: 'value', type: 'number' },
        ],
      },
      { name: 'Report', fields: [{ name: 'generatedAt', type: 'date' }] },
    ],
    screens: [{ name: 'Overview', purpose: 'see key metrics at a glance' }],
    roles: ['manager'],
    keyActions: ['view metrics', 'export report'],
    branding: { accentColor: '#00695C', tone: 'clinical, precise' },
    references: { researchCardIds: [] },
    archetype: 'dashboard',
  },
  {
    schemaVersion: 1,
    productName: 'AdSpendView',
    icp: 'small-business owners tracking ad campaign spend',
    entities: [
      {
        name: 'Metric',
        fields: [
          { name: 'label', type: 'string' },
          { name: 'value', type: 'number' },
        ],
      },
    ],
    screens: [{ name: 'Dashboard', purpose: 'see spend and performance at a glance' }],
    roles: ['owner'],
    keyActions: ['view metrics', 'export report'],
    branding: { accentColor: '#F57F17', tone: 'confident, data-driven' },
    references: { researchCardIds: [] },
    archetype: 'dashboard',
  },
  {
    schemaVersion: 1,
    productName: 'ReadingLog',
    icp: 'avid readers tracking books finished this year',
    entities: [
      {
        name: 'Book',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'author', type: 'string' },
          { name: 'finished', type: 'boolean' },
        ],
      },
    ],
    screens: [{ name: 'Reading list', purpose: 'see all books and progress' }],
    roles: ['reader'],
    keyActions: ['add book', 'mark finished', 'rate book'],
    branding: { accentColor: '#4527A0', tone: 'cozy, literary' },
    references: { researchCardIds: [] },
    archetype: 'crud-tracker',
  },
  {
    schemaVersion: 1,
    productName: 'StudioBook',
    icp: 'independent yoga instructors renting studio time',
    entities: [
      {
        name: 'Session',
        fields: [
          { name: 'className', type: 'string' },
          { name: 'startTime', type: 'date' },
        ],
      },
    ],
    screens: [
      { name: 'Class calendar', purpose: 'see upcoming classes' },
      { name: 'Book class', purpose: 'reserve a spot in a class' },
    ],
    roles: ['instructor', 'student'],
    keyActions: ['book class', 'cancel booking', 'create class'],
    branding: { accentColor: '#00897B', tone: 'calm, welcoming' },
    references: { researchCardIds: [] },
    archetype: 'booking-scheduler',
  },
];
