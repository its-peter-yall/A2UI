# Quiz Randomization API Contract

## Overview

This document defines the API contract for secure server-side quiz randomization and multi-quiz sets per concept node. It establishes the secure option identity pattern that separates stable IDs from display labels to enable shuffling without breaking answer evaluation.

## Secure Option Identity Pattern

### Core Principle

Each quiz option has two identifiers:

1. **`option_id`** (stable UUID): 
   - Generated once, never changes
   - Used for answer submission and evaluation
   - Persists across shuffles, sessions, and retakes
   - Internal to the system, not user-facing

2. **`display_label`** (A-D):
   - User-facing label shown in UI
   - Position may change after server-side shuffle
   - Not used for evaluation, only presentation
   - Determined post-shuffle based on position

### Example

Before shuffle:
```json
{
  "options": [
    {"option_id": "uuid-a", "display_label": "A", "text": "Paris"},
    {"option_id": "uuid-b", "display_label": "B", "text": "London"},
    {"option_id": "uuid-c", "display_label": "C", "text": "Berlin"},
    {"option_id": "uuid-d", "display_label": "D", "text": "Madrid"}
  ]
}
```

After shuffle:
```json
{
  "options": [
    {"option_id": "uuid-c", "display_label": "A", "text": "Berlin"},  // moved to position A
    {"option_id": "uuid-a", "display_label": "B", "text": "Paris"},   // moved to position B
    {"option_id": "uuid-d", "display_label": "C", "text": "Madrid"},  // moved to position C
    {"option_id": "uuid-b", "display_label": "D", "text": "London"}   // moved to position D
  ]
}
```

Submission uses stable `option_id`:
```json
{
  "selected_option_id": "uuid-c",  // Berlin (now showing as option A)
  "quiz_index": 0
}
```

## Schema Reference

### QuizOption (Full)

Used in feedback states (SHOWING_FEEDBACK, COMPLETED).

```python
class QuizOption(BaseModel):
    option_id: str        # Stable UUID (e.g., "550e8400-e29b-41d4-a716-446655440000")
    display_label: str    # User-facing label (A, B, C, D)
    text: str             # Option text shown to user
    is_correct: bool      # Whether this option is correct
    explanation: str      # Why this option is correct/incorrect
```

### QuizOptionHidden (IN_QUIZ State)

Used when sending quiz to client in IN_QUIZ state to prevent answer leakage.

```python
class QuizOptionHidden(BaseModel):
    option_id: str        # Stable UUID for submission
    display_label: str    # User-facing label (A, B, C, D)
    text: str             # Option text shown to user
    # Note: No is_correct or explanation fields
```

### QuizCard / QuizCardHidden

Single quiz question with 4 options.

```python
class QuizCard(BaseModel):
    question_text: str
    options: List[QuizOption]       # Exactly 4 options, 1 correct
    difficulty: str                 # "easy", "medium", "hard"

class QuizCardHidden(BaseModel):
    question_text: str
    options: List[QuizOptionHidden] # No correctness data
    difficulty: str
```

### QuizSet / QuizSetHidden

Container for multiple quizzes per concept node.

```python
class QuizSet(BaseModel):
    quizzes: List[QuizCard]      # 1-5 quizzes
    current_index: int           # Which quiz to show (0-based)
    shuffle_seed: Optional[str]  # For deterministic shuffling

class QuizSetHidden(BaseModel):
    quizzes: List[QuizCardHidden]  # No correctness data
    current_index: int
    total_quizzes: int             # For UI progress indication
```

### QuizSubmission

Request payload for submitting quiz answers.

```python
class QuizSubmission(BaseModel):
    node_id: str
    selected_option_id: str   # Stable UUID from option.option_id
    quiz_index: int = 0       # Index in quiz set (0-based)
```

## Visibility Rules

### State-Based Content Filtering

The server enforces these visibility rules based on node status:

| State | Content | Quiz | Correctness | Explanation |
|-------|---------|------|-------------|-------------|
| LOCKED | Hidden | Hidden | Hidden | Hidden |
| VIEWING_EXPLANATION | Visible | Hidden | Hidden | Hidden |
| IN_QUIZ | Visible | `QuizCardHidden` | Hidden | Hidden |
| SHOWING_FEEDBACK | Visible | `QuizCard` | Visible | Visible |
| COMPLETED | Visible | `QuizCard` | Visible | Visible |

### Response Type Selection

```python
def get_visible_quiz(node: ConceptNode, status: NodeStatus):
    if status == NodeStatus.IN_QUIZ:
        return node.quiz_set_hidden or node.quiz_hidden
    return node.quiz_set or node.quiz
```

## Backward Compatibility

### Legacy Format (Old)

```json
{
  "options": [
    {"id": "A", "text": "Option A", "is_correct": true, "explanation": "..."}
  ]
}
```

### New Format

```json
{
  "options": [
    {"option_id": "uuid", "display_label": "A", "text": "...", "is_correct": true, "explanation": "..."}
  ]
}
```

### Conversion

Use `convert_legacy_quiz_card()` to convert old format to new:

```python
from server.schemas.learning import convert_legacy_quiz_card

legacy_quiz = {...}  # Old format with "id" field
new_quiz = convert_legacy_quiz_card(legacy_quiz)
```

The conversion:
- Maps legacy `id` → `display_label`
- Generates stable UUID for `option_id` (deterministic, based on legacy id)
- Preserves `text`, `is_correct`, `explanation`

## Validation Rules

### QuizCard Requirements

1. Exactly 4 options
2. Exactly 1 correct option
3. Display labels must be A, B, C, D (unique)
4. Option IDs must be unique

### QuizSet Requirements

1. At least 1 quiz
2. At most 5 quizzes
3. `current_index` must be < `len(quizzes)`
4. `shuffle_seed` is optional (for deterministic shuffling)

### QuizSubmission Requirements

1. `selected_option_id` must be a valid option ID in the quiz
2. `quiz_index` must be >= 0 and < total quizzes in set

## Client TypeScript Types

The frontend mirrors these schemas:

```typescript
interface QuizOption {
  option_id: string;       // Stable UUID
  display_label: string;   // A, B, C, D
  text: string;
  is_correct: boolean;
  explanation: string;
}

interface QuizOptionHidden {
  option_id: string;       // Stable UUID for submission
  display_label: string;   // A, B, C, D
  text: string;
  // No is_correct or explanation
}

interface QuizSubmitRequest {
  selected_option_id: string;  // Use option_id, not display_label
  quiz_index?: number;         // Default 0 for single quiz
}
```

## API Endpoints

### Submit Quiz Answer

```http
POST /learning/nodes/{node_id}/submit-quiz
Content-Type: application/json

{
  "selected_option_id": "550e8400-e29b-41d4-a716-446655440000",
  "quiz_index": 0
}
```

Response:
```http
200 OK
Content-Type: application/json

{
  "node_id": "node-123",
  "attempt_number": 1,
  "is_correct": true,
  "score_percent": 100,
  "correct_option_id": "550e8400-e29b-41d4-a716-446655440000",
  "selected_option_id": "550e8400-e29b-41d4-a716-446655440000",
  "explanation": "Paris is the capital of France.",
  "is_mastered": true,
  "next_node_unlocked": false
}
```

## Implementation Notes

### Server-Side Shuffling (Phase 2)

1. Generate cryptographically secure random seed
2. Apply Fisher-Yates shuffle to option order
3. Reassign display_labels A-D based on new positions
4. Preserve option_id associations
5. Store shuffle order in database for consistency

### Security Considerations

1. Never send `is_correct` or `explanation` in IN_QUIZ state
2. Validate option_id exists in quiz before evaluation
3. Use constant-time comparison for answer checking (prevents timing attacks)
4. Rate limit quiz submissions to prevent brute force

### Performance

1. Option validation is O(n) where n=4 (constant time)
2. Shuffle is O(n) where n=4 (constant time)
3. Database storage includes shuffle state for consistency
