/**
 * Notification type → icon mapping.
 */

import {
  AlertTriangle,
  Ban,
  Bell,
  CheckCircle2,
  Crown,
  Download,
  FileText,
  Mail,
  ServerCrash,
  Settings,
  ShieldAlert,
  TimerReset,
  type LucideIcon,
} from 'lucide-react';

import type { NotificationType } from '@/lib/aidip/types';

export const NOTIFICATION_ICON: Record<NotificationType, LucideIcon> = {
  invitation_sent: Mail,
  invitation_accepted: CheckCircle2,
  report_shared: FileText,
  export_ready: Download,
  export_failed: AlertTriangle,
  quota_warning: AlertTriangle,
  quota_exceeded: Ban,
  maintenance: Settings,
  report_official: Crown,
  subscription_expiring: TimerReset,
  schema_outdated: AlertTriangle,
  incident_platform: ServerCrash,
  ai_budget_warning: AlertTriangle,
  company_suspended: Ban,
  user_suspended: ShieldAlert,
};

export function NotificationIcon({
  type,
  className,
}: {
  type: NotificationType;
  className?: string;
}) {
  const Icon = NOTIFICATION_ICON[type] ?? Bell;
  return <Icon className={className} />;
}
