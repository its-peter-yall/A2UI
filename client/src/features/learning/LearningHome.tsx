/**
 * ============================================================================
 * FILE: LearningHome.tsx
 * ============================================================================
 *
 * PURPOSE:
 * Entry point for the adaptive learning feature. Displays a welcoming homepage
 * with a topic input form, an optional course dashboard when courses exist,
 * and explains the mastery-based learning approach. Users enter a topic to
 * learn, which triggers course generation and navigates to the learning path.
 *
 * KEY COMPONENTS:
 * - LearningHome: Main page wrapper with hero, dashboard, and feature overview
 * - TopicInput: Form component for entering learning topics
 * - CourseFilter: Status and sort filter pills for the dashboard
 * - CourseCard: Individual course card with progress and actions
 * - CourseCardSkeleton: Loading placeholder for course cards
 * - Step Indicator: Visual 4-step process (Read, Quiz, Feedback, Master)
 * - Feature Cards: Three cards explaining core learning principles
 *
 * DEPENDENCIES:
 * - react-router-dom: Link and useNavigate for navigation
 * - framer-motion: AnimatePresence and motion for card animations
 * - useCourseList: Hook for fetching course list with filters
 * - TopicInput: Child component for topic entry and course generation
 * - CourseFilter: Filter/sort pill controls
 * - CourseCard: Course summary card
 * - CourseCardSkeleton: Skeleton loading state
 * - @/lib/utils: cn() utility for conditional className composition
 *
 * USAGE PATTERN:
 * ```tsx
 * // Route: /learn (root of learning feature)
 * // Shows topic input and course dashboard when courses exist
 *
 * <LearningHome />
 * ```
 *
 * ERROR HANDLING:
 * - Errors handled by TopicInput component (generation failures)
 * - Course list errors silently fallback to hero-only view
 *
 * PERFORMANCE NOTES:
 * - Course list uses 30-second stale time for responsive updates
 * - Framer Motion stagger animation on card load (50ms gap)
 * - Accumulated pagination avoids full-list refetch
 *
 * RELATED FILES:
 * - TopicInput.tsx: Topic input form and course generation logic
 * - CourseCard.tsx: Individual course card component
 * - CourseFilter.tsx: Filter and sort controls
 * - CourseCardSkeleton.tsx: Skeleton loading state
 * - useCourseList.ts: React Query hook for course fetching
 * - LearningPage.tsx: Individual session page after topic submission
 *
 * NOTES:
 * - Route: /learn
 * - Conditional layout: hero-only for 0 courses, dashboard for 1+ courses
 * - "How It Works" section collapsed behind disclosure when courses exist
 * - Semantic HTML with proper ARIA labels
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { cn } from '@/lib/utils';
import { TopicInput } from './TopicInput';
import { CourseCard } from './CourseCard';
import { CourseFilter } from './CourseFilter';
import type { FilterStatus, SortField } from './CourseFilter';
import { CourseCardSkeleton } from './CourseCardSkeleton';
import { useCourseList } from './useCourseList';

const COURSES_PER_PAGE = 20;

export function LearningHome() {
  const navigate = useNavigate();

  // Filter, sort, and pagination state
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortField>('updated_at');
  const [loadedCount, setLoadedCount] = useState(COURSES_PER_PAGE);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  // Fetch courses using increasing limit for "Load More" pagination
  const { data, isLoading, isFetching } = useCourseList({
    status: filterStatus,
    sortBy,
    limit: loadedCount,
  });

  // Reset pagination when filters change
  const handleStatusChange = useCallback((newStatus: FilterStatus) => {
    setFilterStatus(newStatus);
    setLoadedCount(COURSES_PER_PAGE);
  }, []);

  const handleSortChange = useCallback((newSort: SortField) => {
    setSortBy(newSort);
    setLoadedCount(COURSES_PER_PAGE);
  }, []);

  const handleLoadMore = useCallback(() => {
    setLoadedCount((prev) => prev + COURSES_PER_PAGE);
  }, []);

  // Navigation callbacks
  const handleResume = useCallback(
    (sessionId: string) => {
      navigate(`/learn/${sessionId}`);
    },
    [navigate]
  );

  const handleRevise = useCallback(
    (sessionId: string, _mode: 'full_review' | 'quiz_only') => {
      // TODO: Call revision API to create revision session, then navigate
      // For now, navigate to the session directly
      navigate(`/learn/${sessionId}`);
    },
    [navigate]
  );

  // Derived state from data (no useEffect needed)
  const sessions = data?.sessions ?? [];
  const hasCourses = data !== undefined && data.total_count > 0;
  const isInitialLoad = isLoading && !data;
  const showDashboard = hasCourses;
  const hasMore = data?.has_more ?? false;

  // Empty filter state: server has courses but current filter matches none
  const showEmptyFilterState =
    !isLoading && hasCourses && sessions.length === 0;

  const statusLabel =
    filterStatus === 'in_progress'
      ? 'in-progress'
      : filterStatus === 'completed'
        ? 'completed'
        : '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/"
            className={cn(
              'font-semibold text-lg',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
            )}
          >
            AgUI
          </Link>
          <nav className="flex items-center gap-4" aria-label="Main navigation">
            <Link
              to="/learn"
              className={cn(
                'text-sm font-medium text-primary',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
              )}
              aria-current="page"
            >
              Learn
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 py-12">
        {/* Hero section - compact when courses exist */}
        <div className={cn('text-center', showDashboard ? 'mb-6' : 'mb-8')}>
          <h1
            className={cn(
              'font-bold mb-3',
              showDashboard ? 'text-2xl' : 'text-4xl'
            )}
          >
            Learn Anything
          </h1>
          {!showDashboard && (
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              Enter a topic and master it through guided explanations and quizzes
              that test your understanding.
            </p>
          )}
        </div>

        {/* Topic input */}
        <TopicInput className={showDashboard ? 'mb-8' : 'mb-12'} />

        {/* Course Dashboard (shown when courses exist) */}
        {showDashboard && (
          <section
            className="max-w-4xl w-full mb-12"
            aria-labelledby="your-courses-heading"
          >
            <h2
              id="your-courses-heading"
              className="text-xl font-semibold mb-4"
            >
              Your Courses
            </h2>

            {/* Filter and sort controls */}
            <div className="mb-6">
              <CourseFilter
                status={filterStatus}
                sortBy={sortBy}
                onStatusChange={handleStatusChange}
                onSortChange={handleSortChange}
              />
            </div>

            {/* Course cards grid */}
            {isInitialLoad ? (
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                data-testid="skeleton-grid"
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <CourseCardSkeleton key={i} />
                ))}
              </div>
            ) : showEmptyFilterState ? (
              <div className="text-center py-12" data-testid="empty-filter-state">
                <p className="text-muted-foreground">
                  No {statusLabel} courses found
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AnimatePresence mode="popLayout">
                    {sessions.map((session, index) => (
                      <motion.div
                        key={session.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{
                          type: 'spring',
                          stiffness: 300,
                          damping: 25,
                          delay: index < COURSES_PER_PAGE ? index * 0.05 : 0,
                        }}
                      >
                        <CourseCard
                          session={session}
                          onResume={handleResume}
                          onRevise={handleRevise}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Load More button */}
                {hasMore && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={handleLoadMore}
                      disabled={isFetching}
                      className={cn(
                        'rounded-lg px-6 py-2 text-sm font-medium',
                        'border border-primary/50 text-primary',
                        'hover:bg-primary/10 transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
                      )}
                    >
                      {isFetching ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* How It Works section - collapsible when courses exist */}
        {showDashboard ? (
          <section className="max-w-2xl w-full mb-12">
            <button
              onClick={() => setHowItWorksOpen((prev) => !prev)}
              className={cn(
                'flex items-center gap-2 text-sm font-medium text-muted-foreground',
                'hover:text-foreground transition-colors w-full justify-center',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
              )}
              aria-expanded={howItWorksOpen}
              aria-controls="how-it-works-content"
            >
              <span
                className={cn(
                  'transition-transform duration-200',
                  howItWorksOpen && 'rotate-90'
                )}
                aria-hidden="true"
              >
                {'\u25B6'}
              </span>
              How it works
            </button>
            {howItWorksOpen && (
              <div id="how-it-works-content" className="mt-4">
                <nav aria-label="Learning process steps">
                  <ol className="flex items-center justify-between relative list-none p-0 m-0">
                    <div
                      className="absolute top-6 left-12 right-12 h-0.5 bg-muted"
                      aria-hidden="true"
                    />
                    <Step number={1} title="Read" description="Study the explanation" />
                    <Step number={2} title="Quiz" description="Answer questions" />
                    <Step number={3} title="Feedback" description="Learn from mistakes" />
                    <Step number={4} title="Master" description="Score 100% to proceed" />
                  </ol>
                </nav>
              </div>
            )}
          </section>
        ) : (
          <section className="max-w-2xl w-full mb-12" aria-labelledby="how-it-works">
            <h2 id="how-it-works" className="text-lg font-semibold mb-4 text-center">
              How it works
            </h2>
            <nav aria-label="Learning process steps">
              <ol className="flex items-center justify-between relative list-none p-0 m-0">
                <div
                  className="absolute top-6 left-12 right-12 h-0.5 bg-muted"
                  aria-hidden="true"
                />
                <Step number={1} title="Read" description="Study the explanation" />
                <Step number={2} title="Quiz" description="Answer questions" />
                <Step number={3} title="Feedback" description="Learn from mistakes" />
                <Step number={4} title="Master" description="Score 100% to proceed" />
              </ol>
            </nav>
          </section>
        )}

        {/* Features grid */}
        <section
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full"
          aria-labelledby="features-heading"
        >
          <h2 id="features-heading" className="sr-only">
            Learning features
          </h2>
          <FeatureCard
            title="Sequential Learning"
            description="Progress through topics in order. Master each concept before moving on."
          />
          <FeatureCard
            title="Retrieval Practice"
            description="Quiz without peeking at notes. This strengthens long-term memory."
          />
          <FeatureCard
            title="Mastery Required"
            description="Score 100% on each quiz to unlock the next topic. Retry until you succeed."
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        <p>Powered by retrieval-based learning principles</p>
      </footer>
    </div>
  );
}

interface StepProps {
  number: number;
  title: string;
  description: string;
}

function Step({ number, title, description }: StepProps) {
  return (
    <li className="flex flex-col items-center relative z-10">
      <div
        className={cn(
          'w-12 h-12 rounded-full bg-primary text-primary-foreground',
          'flex items-center justify-center text-lg font-bold mb-2'
        )}
        aria-hidden="true"
      >
        {number}
      </div>
      <span className="font-medium">
        <span className="sr-only">Step {number}: </span>
        {title}
      </span>
      <span className="text-xs text-muted-foreground text-center max-w-[80px]">
        {description}
      </span>
    </li>
  );
}

interface FeatureCardProps {
  title: string;
  description: string;
}

function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <article className="p-4 rounded-lg border bg-card">
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </article>
  );
}
