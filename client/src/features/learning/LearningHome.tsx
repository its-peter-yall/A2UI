/**
 * ============================================================================
 * FILE: LearningHome.tsx
 * LOCATION: client/src/features/learning/LearningHome.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Entry point for the adaptive learning feature. Displays a welcoming
 *    homepage with a topic input form, an optional course dashboard when
 *    courses exist, and explains the mastery-based learning approach.
 *
 * ROLE IN PROJECT:
 *    Root page of the /learn route. Acts as the hub for starting new courses
 *    and managing existing ones. Conditionally renders a compact hero + course
 *    dashboard layout or a full hero-only layout based on course history.
 *
 * KEY COMPONENTS:
 *    - LearningHome: Main page wrapper with hero, dashboard, and feature overview
 *    - TopicInput: Form component for entering learning topics
 *    - CourseFilter: Status and sort filter pills for the dashboard
 *    - CourseCard: Individual course card with progress and actions
 *    - CourseCardSkeleton: Loading placeholder for course cards
 *    - Step Indicator: Visual 4-step process (Read, Quiz, Feedback, Master)
 *    - Feature Cards: Three cards explaining core learning principles
 *
 * DEPENDENCIES:
 *    - External: react, react-router-dom, framer-motion, axios, lucide-react,
 *                @tanstack/react-query
 *    - Internal: @/lib/learningApi, @/lib/utils, @/types/learning,
 *                @/components/ThemeToggle, ./TopicInput, ./CourseCard,
 *                ./CourseFilter, ./CourseCardSkeleton, ./useCourseList
 *
 * USAGE:
 *    ```tsx
 *    // Route: /learn
 *    <LearningHome />
 *    ```
 * ============================================================================
 */

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import axios from 'axios';

import { createRevisionSession, deleteSession } from '@/lib/learningApi';
import { cn } from '@/lib/utils';
import type { SessionListResponse } from '@/types/learning';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TopicInput } from './TopicInput';
import { CourseCard } from './CourseCard';
import { CourseFilter } from './CourseFilter';
import type { FilterStatus, SortField } from './CourseFilter';
import { CourseCardSkeleton } from './CourseCardSkeleton';
import { useCourseList } from './useCourseList';

const COURSES_PER_PAGE = 4;

export function LearningHome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Filter, sort, and pagination state
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortField>('updated_at');
  const [offset, setOffset] = useState(0);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [coursesCollapsed, setCoursesCollapsed] = useState(false);

  // Fetch current page for "Load More" pagination
  const { data, isLoading, isFetching } = useCourseList({
    status: filterStatus,
    sortBy,
    limit: COURSES_PER_PAGE,
    offset,
  });

  // Fetch unfiltered count to determine if dashboard should be shown
  // (separate from filtered results to handle empty filter states)
  const { data: allCoursesData, isLoading: isAllCoursesLoading, isError: isAllCoursesError } = useCourseList({
    status: 'all',
    limit: 1,
    offset: 0,
  });

  const pageResponses = useMemo(() => {
    const responses: SessionListResponse[] = [];
    let hasCurrentOffsetData = false;
    for (
      let pageOffset = 0;
      pageOffset <= offset;
      pageOffset += COURSES_PER_PAGE
    ) {
      const response = queryClient.getQueryData<SessionListResponse>([
        'courses',
        {
          status: filterStatus,
          sortBy,
          limit: COURSES_PER_PAGE,
          offset: pageOffset,
        },
      ]);
      if (response) {
        responses.push(response);
        if (pageOffset === offset) {
          hasCurrentOffsetData = true;
        }
      }
    }
    if (!hasCurrentOffsetData && data) {
      responses.push(data);
    }
    return responses;
  }, [filterStatus, sortBy, offset, queryClient, data]);

  const sessions = useMemo(() => {
    const mergedSessions = pageResponses.flatMap((response) => response.sessions);
    const uniqueSessions = new Map(
      mergedSessions.map((session) => [session.id, session] as const)
    );
    return Array.from(uniqueSessions.values());
  }, [pageResponses]);

  const latestResponse = pageResponses[pageResponses.length - 1] ?? data;
  const totalCount = latestResponse?.total_count ?? 0;

  // Reset pagination when filters change
  const handleStatusChange = useCallback((newStatus: FilterStatus) => {
    setFilterStatus(newStatus);
    setOffset(0);
  }, []);

  const handleSortChange = useCallback((newSort: SortField) => {
    setSortBy(newSort);
    setOffset(0);
  }, []);

  const handleLoadMore = useCallback(() => {
    setOffset((previousOffset) => previousOffset + COURSES_PER_PAGE);
  }, []);

  // Navigation callbacks
  const handleResume = useCallback(
    (sessionId: string) => {
      navigate(`/learn/${sessionId}`);
    },
    [navigate]
  );

  const handleRevise = useCallback(
    async (sessionId: string, mode: 'full_review' | 'quiz_only') => {
      try {
        const revisionSession = await createRevisionSession(sessionId, { mode });
        navigate(`/learn/${sessionId}/revise/${revisionSession.id}`);
      } catch (error) {
        console.error('Failed to create revision session:', error);
      }
    },
    [navigate]
  );

  const handleViewRevision = useCallback(
    (sessionId: string, revisionId: string) => {
      navigate(`/learn/${sessionId}/revise/${revisionId}`);
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async (sessionId: string) => {
      try {
        await deleteSession(sessionId);
      } catch (error) {
        // If 404, session already deleted - treat as success
        const isNotFound =
          axios.isAxiosError(error) && error.response?.status === 404;
        if (!isNotFound) {
          console.error('Failed to delete course:', error);
          return; // Don't invalidate cache on other errors
        }
      }
      // Invalidate React Query cache to refresh the course list
      // This runs on success OR 404 (session already gone)
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
    [queryClient]
  );

  // Derived state for rendering
  const hasAnyCourses = (allCoursesData?.total_count ?? 0) > 0;
  const hasFilteredCourses = totalCount > 0;
  const isInitialLoad = (isLoading && offset === 0 && sessions.length === 0) || isAllCoursesLoading || isAllCoursesError;
  const showDashboard = hasAnyCourses || isAllCoursesLoading || isAllCoursesError;
  const hasMore = latestResponse?.has_more ?? false;
  const shouldAutoFocusTopicInput = searchParams.get('new') === 'true';

  // Empty filter state: user has courses overall but current filter matches none
  const showEmptyFilterState =
    !isLoading && hasAnyCourses && !hasFilteredCourses;

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
            <ThemeToggle />
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
        <TopicInput
          className={showDashboard ? 'mb-8' : 'mb-12'}
          autoFocus={shouldAutoFocusTopicInput}
        />

        {/* Course Dashboard (shown when courses exist) */}
        {showDashboard && (
          <section
            className="max-w-4xl w-full mb-12"
            aria-labelledby="your-courses-heading"
          >
            <button
              onClick={() => setCoursesCollapsed((prev) => !prev)}
              className={cn(
                'flex items-center gap-2 w-full text-left mb-4',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg'
              )}
              aria-expanded={!coursesCollapsed}
              aria-controls="courses-content"
            >
              <h2
                id="your-courses-heading"
                className="text-xl font-semibold"
              >
                Your Courses
              </h2>
              <ChevronDown
                className={cn(
                  'h-5 w-5 text-muted-foreground transition-transform duration-200',
                  coursesCollapsed && '-rotate-90'
                )}
                aria-hidden="true"
              />
            </button>

            <AnimatePresence initial={false}>
              {!coursesCollapsed && (
                <motion.div
                  id="courses-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
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
                                onViewRevision={(revisionId) => {
                                  handleViewRevision(session.id, revisionId);
                                }}
                                onDelete={handleDelete}
                              />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>

                      {/* Load More / Show Less buttons */}
                      {(hasMore || offset > 0) && (
                        <div className="flex justify-center gap-3 mt-6 mb-6">
                          {offset > 0 && (
                            <button
                              onClick={() => setOffset(0)}
                              className={cn(
                                'rounded-lg px-6 py-2 text-sm font-medium',
                                'border border-border text-muted-foreground',
                                'hover:bg-muted transition-colors',
                                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
                              )}
                            >
                              Show Less
                            </button>
                          )}
                          {hasMore && (
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
                          )}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
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
