import {
  BRIEF_ALLOWED_BUCKETS,
  BRIEF_FORBIDDEN_BUCKETS,
} from '../catalog/brief-category-buckets.util';

export const BRIEF_CATEGORIES = [
  'Welcome Pack',
  'Корпоративные подарки',
  'Мерч',
  'Event Kit',
] as const;

/** Укрупнённые группы для UI «можно / нельзя предлагать» (≈10) */
export const BRIEF_ALLOWED_CATEGORIES = BRIEF_ALLOWED_BUCKETS;

export const BRIEF_FORBIDDEN_OPTIONS = BRIEF_FORBIDDEN_BUCKETS;

export type BriefCategory = (typeof BRIEF_CATEGORIES)[number];
export type BriefAllowedCategory = (typeof BRIEF_ALLOWED_CATEGORIES)[number];
export type BriefForbiddenOption = (typeof BRIEF_FORBIDDEN_OPTIONS)[number];
