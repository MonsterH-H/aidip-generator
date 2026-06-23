/**
 * AIDIP — Invite Member modal (Module 7, CDC §8).
 *
 * Dialog form used by admins to send a team invitation. Collects the
 * invitee email, target role, optional personal message and a validity
 * window. On submit, calls `invitation.create()` — the Rayfin invitation
 * service validates the email, generates a secure token, persists the
 * invitation, records an audit log entry, pushes a notification to the
 * inviter, and triggers the email delivery via the configured Rayfin
 * email provider.
 *
 * Premium enterprise styling aligned with Azure Portal / Microsoft Fabric.
 */

import { useEffect, useState } from 'react';
import { Loader2, Mail, Send, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import type { UserRole } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import { cn } from '@/lib/utils';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MAX_MESSAGE = 200;
const MIN_VALIDITY = 1;
const MAX_VALIDITY = 30;
const DEFAULT_VALIDITY = 7;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: () => void;
}

interface FormState {
  email: string;
  role: UserRole;
  personalMessage: string;
  validityDays: number;
}

const initialState: FormState = {
  email: '',
  role: 'analyst',
  personalMessage: '',
  validityDays: DEFAULT_VALIDITY,
};

export function InviteMemberModal({ open, onOpenChange, onInvited }: InviteMemberModalProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [validityError, setValidityError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the modal is opened.
  useEffect(() => {
    if (open) {
      setForm(initialState);
      setEmailError(null);
      setValidityError(null);
      setSubmitting(false);
    }
  }, [open]);

  const validateEmail = (value: string): string | null => {
    if (!value.trim()) return 'Email is required.';
    if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.';
    return null;
  };

  const validateValidity = (value: number): string | null => {
    if (!Number.isFinite(value)) return 'Enter a number of days.';
    if (value < MIN_VALIDITY) return `Minimum is ${MIN_VALIDITY} day.`;
    if (value > MAX_VALIDITY) return `Maximum is ${MAX_VALIDITY} days.`;
    return null;
  };

  const handleEmailBlur = () => {
    setEmailError(validateEmail(form.email));
  };

  const handleValidityChange = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setForm((s) => ({ ...s, validityDays: 0 }));
      setValidityError('Enter a number of days.');
      return;
    }
    setForm((s) => ({ ...s, validityDays: parsed }));
    setValidityError(validateValidity(parsed));
  };

  const canSubmit =
    !submitting &&
    validateEmail(form.email) === null &&
    validateValidity(form.validityDays) === null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailErr = validateEmail(form.email);
    const validityErr = validateValidity(form.validityDays);
    if (emailErr || validityErr) {
      setEmailError(emailErr);
      setValidityError(validityErr);
      return;
    }

    setSubmitting(true);
    try {
      const svc = ServiceContainer.getInstance().aidip.invitation;
      await svc.create({
        email: form.email.trim(),
        role: form.role,
        personalMessage: form.personalMessage.trim() || undefined,
        validityDays: form.validityDays,
      });
      toast.success(`Invitation sent to ${form.email.trim()}`);
      onOpenChange(false);
      onInvited?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            Send an invitation by email. The recipient will be able to join your company workspace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Email */}
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => {
                  setForm((s) => ({ ...s, email: e.target.value }));
                  if (emailError) setEmailError(null);
                }}
                onBlur={handleEmailBlur}
                placeholder="name@company.com"
                className={cn('pl-8', emailError && 'border-destructive focus-visible:ring-destructive/30')}
                aria-invalid={!!emailError}
                disabled={submitting}
              />
            </div>
            {emailError && (
              <p className="text-xs font-medium text-destructive">{emailError}</p>
            )}
          </div>

          {/* Role */}
          <div className="grid gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm((s) => ({ ...s, role: v as UserRole }))}
              disabled={submitting}
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — manage members, KPIs &amp; permissions</SelectItem>
                <SelectItem value="analyst">Analyst — ask questions, build &amp; share reports</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Personal message */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="invite-message">Personal message (optional)</Label>
              <span
                className={cn(
                  'text-[11px]',
                  form.personalMessage.length > MAX_MESSAGE - 20
                    ? 'text-warning'
                    : 'text-muted-foreground',
                )}
              >
                {form.personalMessage.length}/{MAX_MESSAGE}
              </span>
            </div>
            <Textarea
              id="invite-message"
              value={form.personalMessage}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  personalMessage: e.target.value.slice(0, MAX_MESSAGE),
                }))
              }
              placeholder="Add a short note that will be included in the invitation email…"
              rows={3}
              disabled={submitting}
            />
          </div>

          {/* Validity days */}
          <div className="grid gap-1.5">
            <Label htmlFor="invite-validity">Invitation validity (days)</Label>
            <Input
              id="invite-validity"
              type="number"
              min={MIN_VALIDITY}
              max={MAX_VALIDITY}
              value={form.validityDays}
              onChange={(e) => handleValidityChange(e.target.value)}
              className={cn('w-32', validityError && 'border-destructive focus-visible:ring-destructive/30')}
              aria-invalid={!!validityError}
              disabled={submitting}
            />
            {validityError ? (
              <p className="text-xs font-medium text-destructive">{validityError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Between {MIN_VALIDITY} and {MAX_VALIDITY} days.
              </p>
            )}
          </div>

          {/* Note */}
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              An invitation email will be sent to the recipient with a link to accept. The link
              expires after{' '}
              <span className="font-medium text-foreground">{form.validityDays || 0} day{form.validityDays === 1 ? '' : 's'}</span>.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="gap-1.5">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
