/**
 * ============================================================================
 * FILE: vitest.revision.config.ts
 * LOCATION: client/vitest.revision.config.ts
 * ============================================================================
 * PURPOSE:
 *    Enforce a separate strict per-file coverage gate for new revision units.
 * ROLE IN PROJECT:
 *    Complements, never replaces or weakens, the generation coverage gate.
 *    Includes real integration and producer unit tests with V8 instrumentation.
 * KEY COMPONENTS:
 *    - revisionConfig: Per-file 81% branches/functions/lines/statements
 * ============================================================================
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vite.config';

export const revisionConfig = mergeConfig(baseConfig, defineConfig({
  test: {
    include: [
      'src/features/learning/QuizResultDetails.test.tsx',
      'src/features/learning/QuizFeedback.test.tsx',
      'src/features/learning/RevisionQuizSection.test.tsx',
      'src/features/learning/revisionQuizState.test.ts',
      'src/features/learning/RevisionConceptCard.test.tsx',
      'src/features/learning/RevisionPage.test.tsx',
      'src/features/learning/useRevisionSession.test.ts',
      'src/features/learning/useRevisionMutations.test.tsx',
      'src/features/learning/RevisionSummaryModal.test.tsx',
      'src/features/learning/RevisionHistoryList.test.tsx',
      'src/features/learning/ConceptChatLayout.test.tsx',
      'src/features/learning/useConceptChatPanel.test.ts',
      'src/features/learning/ChatPanel.test.tsx',
      'src/features/learning/useConceptChat.test.ts',
      'src/features/learning/LearningPathContainer.test.tsx',
      'src/features/learning/curiosityParser.test.ts',
      'src/features/learning/CuriositySpark.test.tsx',
      'src/features/learning/__tests__/completedCourseReviewParity.test.tsx',
      'src/lib/learningApi.test.ts',
    ],
    coverage: {
      provider: 'v8',
      all: true,
      include: [
        'src/features/learning/QuizResultDetails.tsx',
        'src/features/learning/RevisionQuizSection.tsx',
        'src/features/learning/revisionQuizState.ts',
        'src/features/learning/ConceptChatLayout.tsx',
        'src/features/learning/useConceptChatPanel.ts',
      ],
      reportsDirectory: 'coverage/revision',
      reporter: ['text', 'json-summary', 'html'],
      reportOnFailure: true,
      thresholds: { perFile: true, branches: 81, functions: 81, lines: 81, statements: 81 },
    },
  },
}));

// Config-loader exception must be approved; feature exports remain named.
export default revisionConfig;
