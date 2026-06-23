/**
 * AIDIP — Share report modal (Module 5 / CDC §9.3).
 *
 * Lets a report owner grant or revoke access for company members. Supports
 * read/write permissions, advanced options (download, reshare, expiration,
 * personal message) and shows the current "Shared with" list with quick
 * permission-modify / revoke actions.
 *
 * Anti-hallucination: the recipient search is powered by IUserService.listByCompany
 * (scoped to the current company), so only real members can be selected.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ChevronDown,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';

import type { ReportShare, ReportShareInput, User } from '@/lib/aidip/types';
import { ServiceContainer } from '@/services/ServiceContainer';
import { useAidipSession } from '@/hooks/aidip/useAidipSession';
import { formatDateTime, formatRelativeTime, getInitials } from '@/lib/aidip/format';

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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

interface ShareModalProps {
  reportId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareModal({ reportId, open, onOpenChange }: ShareModalProps) {
  const { user: currentUser } = useAidipSession();
  const [shares, setShares] = useState<ReportShare[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);

  // Recipient search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<User | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Permission + advanced options
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowReshare, setAllowReshare] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    setLoadingShares(true);
    try {
      const list = await ServiceContainer.getInstance().aidip.report.listShares(reportId);
      setShares(list);
    } catch (e) {
      console.error('Failed to load shares:', e);
    } finally {
      setLoadingShares(false);
    }
  }, [reportId]);

  useEffect(() => {
    if (open) {
      void loadShares();
      // Reset form
      setSearchQuery('');
      setSelectedRecipient(null);
      setPermission('read');
      setAllowDownload(true);
      setAllowReshare(false);
      setExpiresAt('');
      setPersonalMessage('');
      setAdvancedOpen(false);
    }
  }, [open, loadShares]);

  // Debounced recipient search
  useEffect(() => {
    if (!open) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const handle = setTimeout(async () => {
      try {
        const users = await ServiceContainer.getInstance().aidip.user.listByCompany({ search: q });
        // Exclude current user
        setSearchResults(users.filter((u) => u.id !== currentUser?.id));
      } catch (e) {
        console.error('Recipient search failed:', e);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [searchQuery, open, currentUser?.id]);

  const handleShare = async () => {
    if (!selectedRecipient) {
      toast.error('Please select a recipient.');
      return;
    }
    if (personalMessage.length > 200) {
      toast.error('Personal message must be 200 characters or fewer.');
      return;
    }
    setSubmitting(true);
    try {
      const input: ReportShareInput = {
        sharedWithUserId: selectedRecipient.id,
        permission,
        allowDownload,
        allowReshare,
        personalMessage: personalMessage.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      await ServiceContainer.getInstance().aidip.report.share(reportId, input);
      toast.success(`Report shared with ${selectedRecipient.fullName}.`);
      // Reset & refresh
      setSelectedRecipient(null);
      setSearchQuery('');
      setPersonalMessage('');
      setExpiresAt('');
      setAllowDownload(true);
      setAllowReshare(false);
      setPermission('read');
      await loadShares();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to share report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (shareId: string, name: string) => {
    setRevokingId(shareId);
    try {
      await ServiceContainer.getInstance().aidip.report.revokeShare(reportId, shareId);
      toast.success(`Access revoked for ${name}.`);
      await loadShares();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke access.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleModifyPermission = async (share: ReportShare, next: 'read' | 'write') => {
    try {
      await ServiceContainer.getInstance().aidip.report.updateShare(reportId, share.id, {
        sharedWithUserId: share.sharedWith,
        permission: next,
        allowDownload: share.allowDownload,
        allowReshare: share.allowReshare,
        personalMessage: share.personalMessage ?? undefined,
        expiresAt: share.expiresAt,
      });
      toast.success(`Permission updated to ${next === 'write' ? 'Write' : 'Read'} for ${share.sharedWithName}.`);
      await loadShares();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update permission.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Share report</DialogTitle>
          <DialogDescription>
            Grant access to colleagues in your company. Data is always live — recipients see the latest results on every open.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="flex flex-col gap-4 pb-2">
            {/* Recipient search */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="share-recipient">Recipient</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="share-recipient"
                  value={selectedRecipient ? selectedRecipient.fullName : searchQuery}
                  placeholder="Search by name or email…"
                  className="pl-8 pr-8"
                  autoComplete="off"
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedRecipient(null);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                {selectedRecipient ? (
                  <button
                    type="button"
                    aria-label="Clear recipient"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                    onClick={() => {
                      setSelectedRecipient(null);
                      setSearchQuery('');
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : searchLoading ? (
                  <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}

                {showSuggestions && !selectedRecipient && searchQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                    {searchResults.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-muted-foreground">
                        No matching members found.
                      </div>
                    ) : (
                      <ul className="py-1">
                        {searchResults.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedRecipient(u);
                                setSearchQuery('');
                                setShowSuggestions(false);
                              }}
                            >
                              <Avatar className="size-7">
                                <AvatarFallback className="bg-primary-subtle text-[10px] font-medium text-primary">
                                  {getInitials(u.fullName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-foreground">{u.fullName}</p>
                                <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Permission */}
            <div className="flex flex-col gap-1.5">
              <Label>Permission level</Label>
              <RadioGroup
                value={permission}
                onValueChange={(v) => setPermission(v as 'read' | 'write')}
                className="grid grid-cols-2 gap-2"
              >
                <PermissionOption
                  value="read"
                  label="Read"
                  description="Can view and refresh the report."
                  checked={permission === 'read'}
                />
                <PermissionOption
                  value="write"
                  label="Write"
                  description="Can edit, add sections, and refresh data."
                  checked={permission === 'write'}
                />
              </RadioGroup>
            </div>

            {/* Advanced options */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <span>Advanced options</span>
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 flex flex-col gap-3 rounded-md border border-border bg-surface-muted/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="allow-download" className="cursor-pointer text-xs font-medium">
                      Allow download
                    </Label>
                    <span className="text-[11px] text-muted-foreground">Recipient can export the report.</span>
                  </div>
                  <Checkbox
                    id="allow-download"
                    checked={allowDownload}
                    onCheckedChange={(v) => setAllowDownload(v === true)}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="allow-reshare" className="cursor-pointer text-xs font-medium">
                      Allow re-share
                    </Label>
                    <span className="text-[11px] text-muted-foreground">Recipient can share with others.</span>
                  </div>
                  <Checkbox
                    id="allow-reshare"
                    checked={allowReshare}
                    onCheckedChange={(v) => setAllowReshare(v === true)}
                  />
                </div>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="share-expires" className="text-xs font-medium">
                    Expiration date <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="share-expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="share-message" className="text-xs font-medium">
                      Personal message <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <span className="text-[10px] text-muted-foreground">{personalMessage.length}/200</span>
                  </div>
                  <Textarea
                    id="share-message"
                    value={personalMessage}
                    onChange={(e) => setPersonalMessage(e.target.value.slice(0, 200))}
                    placeholder="Add a note for the recipient…"
                    className="min-h-[64px] text-xs"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Shared with list */}
          <div className="mt-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Shared with
              </h4>
              {shares.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {shares.length} {shares.length === 1 ? 'person' : 'people'}
                </span>
              )}
            </div>
            {loadingShares ? (
              <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : shares.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border bg-surface-muted/40 px-4 py-6 text-center">
                <UserPlus className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs font-medium text-foreground">No one has access yet.</p>
                <p className="text-[11px] text-muted-foreground">
                  Search for a colleague above to grant access.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {shares.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-primary-subtle text-[10px] font-medium text-primary">
                        {getInitials(s.sharedWithName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{s.sharedWithName}</p>
                      <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <Mail className="h-3 w-3" /> {s.sharedWithEmail}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={s.permission === 'write' ? 'default' : 'secondary'}
                        className="gap-1 text-[10px]"
                      >
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {s.permission === 'write' ? 'Write' : 'Read'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        Shared {formatRelativeTime(s.createdAt)}
                      </span>
                      {s.expiresAt && (
                        <span className="text-[10px] text-warning">
                          Expires {formatDateTime(s.expiresAt, 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Toggle read/write"
                        onClick={() =>
                          handleModifyPermission(s, s.permission === 'read' ? 'write' : 'read')
                        }
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                        title="Revoke access"
                        disabled={revokingId === s.id}
                        onClick={() => void handleRevoke(s.id, s.sharedWithName)}
                      >
                        {revokingId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => void handleShare()}
            disabled={!selectedRecipient || submitting}
            className="gap-1.5"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function PermissionOption({
  value,
  label,
  description,
  checked,
}: {
  value: string;
  label: string;
  description: string;
  checked: boolean;
}) {
  return (
    <Label
      htmlFor={`perm-${value}`}
      className={cn(
        'flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2.5 transition-colors',
        checked
          ? 'border-primary bg-primary-subtle/60'
          : 'border-border bg-card hover:bg-muted',
      )}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value={value} id={`perm-${value}`} />
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>
      <span className="pl-6 text-[11px] text-muted-foreground">{description}</span>
    </Label>
  );
}
