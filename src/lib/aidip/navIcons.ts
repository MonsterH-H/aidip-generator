/**
 * Sidebar icon registry — maps string names to lucide-react icon components.
 * Centralized so navigation config stays as plain data.
 */

import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Bell,
  User,
  Users,
  BarChart3,
  Settings,
  Building2,
  Cpu,
  ShieldAlert,
  HelpCircle,
  type LucideIcon,
  Circle,
} from 'lucide-react';

export const lucideIcons = {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Bell,
  User,
  Users,
  BarChart3,
  Settings,
  Building2,
  Cpu,
  ShieldAlert,
  HelpCircle,
  Circle,
} satisfies Record<string, LucideIcon>;
