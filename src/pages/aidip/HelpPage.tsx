/**
 * AIDIP Help & Documentation page.
 *
 * Route: /help (any authenticated user).
 *
 * Surfaces getting-started steps, keyboard shortcuts, search operators,
 * a collapsible FAQ, and a support card with the HESYD support email.
 * Premium enterprise styling aligned with Azure Portal docs.
 */

import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Compass,
  HelpCircle,
  Keyboard,
  LifeBuoy,
  Mail,
  Rocket,
  Search,
} from 'lucide-react';

import { AIDIP_BRAND } from '@/lib/aidip/constants';

import {
  PageContainer,
  PageHeader,
} from '@/components/aidip/PagePrimitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ----------------------------------------------------------------------------
   Static content
---------------------------------------------------------------------------- */

interface GettingStartedStep {
  title: string;
  description: string;
}

const GETTING_STARTED_STEPS: GettingStartedStep[] = [
  {
    title: 'Sign in',
    description:
      'Sign in with your Microsoft Entra ID account using the email that received the invitation.',
  },
  {
    title: 'Ask your first question',
    description:
      'Open Conversations and ask any business question in natural language — the AI translates it to DAX and runs it against your Fabric semantic model.',
  },
  {
    title: 'Create a report',
    description:
      'Pin one or more assistant answers into a structured report you can edit, organize, and share with your team.',
  },
  {
    title: 'Export & share',
    description:
      'Export your report to PDF or PowerPoint, or share it with teammates with read or write permissions.',
  },
];

interface Shortcut {
  keys: string;
  description: string;
}

const KEYBOARD_SHORTCUTS: Shortcut[] = [
  { keys: '⌘K', description: 'Open global search' },
  { keys: 'Enter', description: 'Send chat message' },
  { keys: 'Shift+Enter', description: 'Insert a new line in the chat input' },
  { keys: 'Esc', description: 'Cancel an in-progress AI generation' },
  { keys: '↑ / ↓', description: 'Navigate search results' },
];

interface SearchOperator {
  syntax: string;
  description: string;
  example: string;
}

const SEARCH_OPERATORS: SearchOperator[] = [
  {
    syntax: 'type:report',
    description: 'Restrict the search to reports.',
    example: 'type:report revenue',
  },
  {
    syntax: 'type:conversation',
    description: 'Restrict the search to conversations.',
    example: 'type:conversation churn',
  },
  {
    syntax: 'date:YYYY-MM-DD..YYYY-MM-DD',
    description: 'Filter by a date range (inclusive).',
    example: 'date:2026-01-01..2026-03-31 sales',
  },
  {
    syntax: '"exact phrase"',
    description: 'Match an exact sequence of words.',
    example: '"top 5 products"',
  },
  {
    syntax: '-exclude',
    description: 'Exclude results containing the term.',
    example: 'inventory -archived',
  },
  {
    syntax: 'title:keyword',
    description: 'Restrict the match to the item title.',
    example: 'title:Q3 review',
  },
];

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'How do I get an account?',
    answer:
      'AIDIP is invitation-only. Ask your company administrator to send you an invitation.',
  },
  {
    question: 'Where is my data stored?',
    answer:
      "All data stays in your company's Microsoft Fabric workspace. AIDIP never exfiltrates data.",
  },
  {
    question: "Why does the AI say 'No data was found'?",
    answer:
      'This is the anti-hallucination guardrail. The AI never invents numbers — if the DAB query returns 0 rows, it tells you so.',
  },
  {
    question: 'How are reports different from Power BI dashboards?',
    answer:
      'AIDIP reports store only structure (queries + visual configs), not data. Data is recomputed live on every open.',
  },
  {
    question: 'What happens when I exceed my daily quota?',
    answer:
      'New queries are blocked until midnight UTC. Your admin can increase the quota or upgrade the plan.',
  },
];

/* ----------------------------------------------------------------------------
   Page
---------------------------------------------------------------------------- */

export function HelpPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Help & Documentation"
        subtitle="Guides, shortcuts, and answers to common questions."
      />

      {/* ====================== Top 3-card grid ====================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GettingStartedCard />
        <ShortcutsCard />
        <SearchOperatorsCard />
      </div>

      {/* ====================== FAQ + Support ====================== */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <HelpCircle className="h-4 w-4 text-primary" />
              Frequently Asked Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <Accordion type="single" collapsible className="w-full">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-sm font-medium">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <SupportCard />
      </div>
    </PageContainer>
  );
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */

function GettingStartedCard() {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Rocket className="h-4 w-4 text-primary" />
          Getting Started
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">
        <ol className="space-y-4">
          {GETTING_STARTED_STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-subtle-foreground">
                {i + 1}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {step.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {step.description}
                </span>
              </div>
            </li>
          ))}
        </ol>
        <Button asChild variant="outline" size="sm" className="mt-5 w-full gap-1.5">
          <Link to="/chat?new=true">
            Open the chatbot
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ShortcutsCard() {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Keyboard className="h-4 w-4 text-primary" />
          Keyboard Shortcuts
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shortcut</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {KEYBOARD_SHORTCUTS.map((s) => (
              <TableRow key={s.keys}>
                <TableCell>
                  <kbd className="inline-flex min-w-7 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
                    {s.keys}
                  </kbd>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.description}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SearchOperatorsCard() {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Search className="h-4 w-4 text-primary" />
          Search Operators
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Syntax</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SEARCH_OPERATORS.map((op) => (
              <TableRow key={op.syntax}>
                <TableCell className="font-mono text-xs text-foreground">
                  {op.syntax}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {op.description}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SupportCard() {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <LifeBuoy className="h-4 w-4 text-primary" />
          Support
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-subtle">
            <Mail className="h-4 w-4 text-primary" />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email support
            </span>
            <a
              href={`mailto:${AIDIP_BRAND.supportEmail}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {AIDIP_BRAND.supportEmail}
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              We typically reply within one business day.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Bell className="h-3.5 w-3.5 text-primary" />
            Notification preferences
          </div>
          <p className="mt-1">
            Control which emails and in-app alerts you receive from your profile.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full gap-1.5">
            <Link to="/profile">
              Manage notifications
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Compass className="h-3.5 w-3.5" />
          <span>
            Tip: press <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">⌘K</kbd> anywhere to open global search.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
