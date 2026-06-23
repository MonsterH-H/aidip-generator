/**
 * AIDIP — Formatting & display utilities.
 */

import { dateFnsLocalizer } from '../dateFnsLocalizer';

const { formatDistanceToNowStrict, format, parseISO, differenceInMinutes } = dateFnsLocalizer;

/* ----------------------------------------------------------------------------
   Currency & number formatting
---------------------------------------------------------------------------- */

export function formatCurrency(value: number, currency = 'MAD', locale = 'en-US'): string {
  const currencySymbol: Record<string, string> = {
    MAD: 'DH',
    EUR: '€',
    USD: '$',
    GBP: '£',
    AED: 'AED',
  };
  const symbol = currencySymbol[currency] ?? currency;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
  return currency === 'USD' || currency === 'GBP'
    ? `${symbol}${formatted}`
    : `${formatted} ${symbol}`;
}

export function formatNumber(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(fractionDigits)}%`;
}

export function formatFileSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/* ----------------------------------------------------------------------------
   Date & time formatting
---------------------------------------------------------------------------- */

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNowStrict(parseISO(iso)) + ' ago';
  } catch {
    return '—';
  }
}

export function formatDateTime(iso: string | null, formatStr = "MMM d, yyyy 'at' h:mm a"): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), formatStr);
  } catch {
    return '—';
  }
}

export function formatDate(iso: string | null, formatStr = 'MMM d, yyyy'): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), formatStr);
  } catch {
    return '—';
  }
}

/** Returns "Updated 3 min ago" style freshness label. */
export function formatFreshness(iso: string | null): string {
  if (!iso) return 'Never updated';
  try {
    const diff = differenceInMinutes(new Date(), parseISO(iso));
    if (diff < 1) return 'Updated just now';
    if (diff < 60) return `Updated ${diff} min ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `Updated ${hours} h ago`;
    const days = Math.floor(hours / 24);
    return `Updated ${days} d ago`;
  } catch {
    return '—';
  }
}

/* ----------------------------------------------------------------------------
   Time-of-day greeting (dashboard welcome banner)
---------------------------------------------------------------------------- */

export function timeOfDayGreeting(date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = date.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export function greetingPrefix(date = new Date()): string {
  const t = timeOfDayGreeting(date);
  return t === 'morning' ? 'Good morning' : t === 'afternoon' ? 'Good afternoon' : 'Good evening';
}

/* ----------------------------------------------------------------------------
   Initials / avatar helpers
---------------------------------------------------------------------------- */

export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/* ----------------------------------------------------------------------------
   Quota helpers
---------------------------------------------------------------------------- */

export function quotaPercent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

export function quotaWarningLevel(used: number, total: number): 'ok' | 'warning' | 'critical' {
  const pct = quotaPercent(used, total);
  if (pct >= 100) return 'critical';
  if (pct >= 80) return 'warning';
  return 'ok';
}

/* ----------------------------------------------------------------------------
   String helpers
---------------------------------------------------------------------------- */

export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}
