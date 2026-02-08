// LearningHome.tsx
// Learning home page with topic input and feature overview

// Entry point for the learning feature. Shows topic input
// and explains the mastery-based learning approach.

// @see: client/src/features/learning/TopicInput.tsx
// @note: Route: /learn

// Best practices applied:
// - Semantic HTML structure with main, header, footer
// - Accessible navigation with proper ARIA labels
// - Step indicator follows accessibility patterns
// - Mobile responsive design considerations

import { Link } from 'react-router-dom';
import { TopicInput } from './TopicInput';
import { cn } from '@/lib/utils';

export function LearningHome() {
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
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Hero section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">Learn Anything</h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Enter a topic and master it through guided explanations and quizzes
            that test your understanding.
          </p>
        </div>

        {/* Topic input */}
        <TopicInput className="mb-12" />

        {/* Sequential flow explanation */}
        <section className="max-w-2xl w-full mb-12" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-lg font-semibold mb-4 text-center">
            How it works
          </h2>
          <nav aria-label="Learning process steps">
            <ol className="flex items-center justify-between relative list-none p-0 m-0">
              {/* Connecting line - decorative */}
              <div
                className="absolute top-6 left-12 right-12 h-0.5 bg-muted"
                aria-hidden="true"
              />

              <Step
                number={1}
                title="Read"
                description="Study the explanation"
              />
              <Step
                number={2}
                title="Quiz"
                description="Answer questions"
              />
              <Step
                number={3}
                title="Feedback"
                description="Learn from mistakes"
              />
              <Step
                number={4}
                title="Master"
                description="Score 100% to proceed"
              />
            </ol>
          </nav>
        </section>

        {/* Features grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full" aria-labelledby="features-heading">
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
