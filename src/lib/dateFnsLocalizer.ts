/**
 * Localizer for date-fns — keeps imports centralized so we can swap locales later.
 *
 * CDC §21.1 locks UI language to English for the MVP, so we use the en-US
 * locale everywhere. This wrapper is the single point of contact with
 * date-fns; if we later add French (next-intl), only this file changes.
 */

import {
  format,
  formatDistanceToNowStrict,
  parseISO,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  isToday,
  isYesterday,
  isValid,
} from 'date-fns';

export const dateFnsLocalizer = {
  format,
  formatDistanceToNowStrict,
  parseISO,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  isToday,
  isYesterday,
  isValid,
} as const;
