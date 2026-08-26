/**
 * SPIKE (#27) — throwaway manifest shape for testing generation reliability.
 * NOT the real schema — #32 designs that properly, informed by this spike.
 */

export interface SpikeField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  enumValues?: string[];
}

export interface SpikeEntity {
  name: string;
  fields: SpikeField[];
}

export interface SpikeScreen {
  name: string;
  purpose: string;
}

export interface SpikeManifest {
  archetype: string;
  productName: string;
  icp: string;
  entities: SpikeEntity[];
  screens: SpikeScreen[];
  roles: string[];
  keyActions: string[];
  branding: { accentColor: string; tone: string };
}

export const FIXTURES: SpikeManifest[] = [
  {
    archetype: 'crud-tracker',
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [
      {
        name: 'Habit',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'frequency', type: 'enum', enumValues: ['daily', 'weekly'] },
          { name: 'streak', type: 'number' },
          { name: 'active', type: 'boolean' },
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
  },
  {
    archetype: 'marketplace-listing',
    productName: 'GearSwap',
    icp: 'hobbyist photographers buying/selling used gear',
    entities: [
      {
        name: 'Listing',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'price', type: 'number' },
          { name: 'condition', type: 'enum', enumValues: ['new', 'used', 'for-parts'] },
          { name: 'sellerName', type: 'string' },
        ],
      },
      {
        name: 'Offer',
        fields: [
          { name: 'listingId', type: 'string' },
          { name: 'amount', type: 'number' },
          { name: 'status', type: 'enum', enumValues: ['pending', 'accepted', 'declined'] },
        ],
      },
    ],
    screens: [
      { name: 'Browse listings', purpose: 'search/filter available gear' },
      { name: 'Listing detail', purpose: 'view a listing and make an offer' },
      { name: 'My offers', purpose: 'track offers made and received' },
    ],
    roles: ['buyer', 'seller'],
    keyActions: ['create listing', 'make offer', 'accept offer', 'decline offer'],
    branding: { accentColor: '#EF6C00', tone: 'trustworthy, community-driven' },
  },
  {
    archetype: 'booking-scheduler',
    productName: 'ChairTime',
    icp: 'independent hairdressers managing their own bookings',
    entities: [
      {
        name: 'Appointment',
        fields: [
          { name: 'clientName', type: 'string' },
          { name: 'service', type: 'string' },
          { name: 'startTime', type: 'date' },
          { name: 'durationMinutes', type: 'number' },
          { name: 'status', type: 'enum', enumValues: ['booked', 'completed', 'cancelled'] },
        ],
      },
    ],
    screens: [
      { name: 'Day schedule', purpose: "see today's appointments in a timeline" },
      { name: 'New booking', purpose: 'create a new appointment' },
    ],
    roles: ['stylist'],
    keyActions: ['book appointment', 'cancel appointment', 'mark completed'],
    branding: { accentColor: '#6A1B9A', tone: 'professional, calm' },
  },
  {
    archetype: 'content-feed',
    productName: 'RecipeRiver',
    icp: 'home cooks sharing weeknight recipes',
    entities: [
      {
        name: 'Recipe',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'authorName', type: 'string' },
          { name: 'cookTimeMinutes', type: 'number' },
          { name: 'likeCount', type: 'number' },
        ],
      },
      {
        name: 'Comment',
        fields: [
          { name: 'recipeId', type: 'string' },
          { name: 'authorName', type: 'string' },
          { name: 'text', type: 'string' },
        ],
      },
    ],
    screens: [
      { name: 'Feed', purpose: 'scroll recent recipes' },
      { name: 'Recipe detail', purpose: 'view full recipe and comments' },
    ],
    roles: ['user'],
    keyActions: ['post recipe', 'like recipe', 'comment on recipe'],
    branding: { accentColor: '#C62828', tone: 'warm, appetizing' },
  },
  {
    archetype: 'dashboard',
    productName: 'ShipMetrics',
    icp: 'small e-commerce teams tracking order fulfillment',
    entities: [
      {
        name: 'Order',
        fields: [
          { name: 'orderNumber', type: 'string' },
          {
            name: 'status',
            type: 'enum',
            enumValues: ['pending', 'shipped', 'delivered', 'delayed'],
          },
          { name: 'value', type: 'number' },
          { name: 'placedAt', type: 'date' },
        ],
      },
    ],
    screens: [
      { name: 'Overview', purpose: 'KPI cards + order status breakdown' },
      { name: 'Order list', purpose: 'filterable table of all orders' },
    ],
    roles: ['ops-manager'],
    keyActions: ['filter orders', 'mark shipped', 'mark delayed'],
    branding: { accentColor: '#1565C0', tone: 'clean, data-forward' },
  },
];
