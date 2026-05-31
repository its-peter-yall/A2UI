---
phase: 3-refactor-quiz-generation-remove-option-i
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/schemas/learning.py
  - server/agents/quizzer.py
  - server/tests/test_quizzer_agent.py
autonomous: true

must_haves:
  truths:
    - LLM generates quiz content WITHOUT option_id field
    - Backend generates UUIDs for option_id after receiving LLM response
    - Existing stored quizzes continue to work (backward compatibility)
    - All existing tests pass
    - New tests verify LLM schema → storage schema conversion
  artifacts:
    - path: server/schemas/learning.py
      provides: LLMQuizOption, LLMQuizCard, LLMQuizSet schemas (LLM output without option_id)
    - path: server/agents/quizzer.py
      provides: Updated prompts and conversion method to generate UUIDs post-LLM
    - path: server/tests/test_quizzer_agent.py
      provides: Updated tests for new architecture
  key_links:
    - from: LLMQuizOption (LLM output)
      to: QuizOption (storage)
      via: QuizzerAgent._convert_llm_to_storage()
      pattern: "generate UUID4, map all other fields"
---

<objective>
Refactor quiz generation to remove option_id from LLM output and generate UUIDs in the backend.

Purpose: Eliminate the architectural inconsistency where the LLM hallucinates fake UUIDs to satisfy schema requirements, replacing it with clean backend-controlled UUID generation.

Output: 
- New LLM-specific schemas without option_id
- Updated quizzer agent using LLM schemas for generation
- Post-processing method to generate UUIDs and convert to storage schemas
- Simplified _fix_option_ids() or removal since backend now controls UUIDs
- All tests passing
</objective>

<execution_context>
@C:/Users/Peter/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@server/schemas/learning.py
@server/agents/quizzer.py
@server/tests/test_quizzer_agent.py
</context>

<tasks>

<task type="auto">
  <name>Create LLM-specific quiz schemas without option_id</name>
  <files>server/schemas/learning.py</files>
  <action>
Create three new schemas for LLM output (no option_id):

1. **LLMQuizOption** - Same fields as QuizOption EXCEPT no option_id field:
   - display_label: str (A/B/C/D)
   - text: str
   - is_correct: bool
   - explanation: str
   - Add field_validator for display_label (must be A, B, C, D)

2. **LLMQuizCard** - Same fields as QuizCard but uses LLMQuizOption:
   - question_text: str
   - options: List[LLMQuizOption] (exactly 4)
   - difficulty: str
   - Add field_validator for options (exactly 4, exactly 1 correct, display_labels A/B/C/D)

3. **LLMQuizSet** - Same fields as QuizSet but uses LLMQuizCard:
   - quizzes: List[LLMQuizCard]
   - current_index: int
   - shuffle_seed: Optional[str]
   - Add field_validator for quizzes (1-5)

Add conversion methods:
- `convert_llm_to_quiz_option(llm_option: LLMQuizOption, option_id: str) -> QuizOption`
- `convert_llm_to_quiz_card(llm_card: LLMQuizCard) -> QuizCard` (generates UUIDs internally)
- `convert_llm_to_quiz_set(llm_set: LLMQuizSet) -> QuizSet` (generates UUIDs ensuring uniqueness across all quizzes)

Place new schemas after the existing QuizSetHidden class (around line 310).

Document the purpose: "LLM output schemas - backend generates UUIDs for option_id"
  </action>
  <verify>
python -c "
from server.schemas.learning import LLMQuizOption, LLMQuizCard, LLMQuizSet, convert_llm_to_quiz_card
from pydantic import ValidationError

# Test LLMQuizOption (no option_id)
try:
    opt = LLMQuizOption(display_label='A', text='Test', is_correct=True, explanation='Why')
    print('✓ LLMQuizOption created without option_id')
except Exception as e:
    print(f'✗ Failed: {e}')

# Test display_label validation
try:
    LLMQuizOption(display_label='E', text='Test', is_correct=True, explanation='Why')
    print('✗ Should have rejected invalid display_label')
except ValidationError:
    print('✓ display_label validation works')

# Test LLMQuizCard
try:
    card = LLMQuizCard(
        question_text='Test?',
        options=[
            LLMQuizOption(display_label='A', text='A', is_correct=True, explanation='A'),
            LLMQuizOption(display_label='B', text='B', is_correct=False, explanation='B'),
            LLMQuizOption(display_label='C', text='C', is_correct=False, explanation='C'),
            LLMQuizOption(display_label='D', text='D', is_correct=False, explanation='D'),
        ],
        difficulty='medium'
    )
    print('✓ LLMQuizCard created')
except Exception as e:
    print(f'✗ Failed: {e}')

# Test conversion generates UUIDs
quiz_card = convert_llm_to_quiz_card(card)
assert hasattr(quiz_card.options[0], 'option_id'), 'Missing option_id'
import uuid
uuid.UUID(quiz_card.options[0].option_id)  # Validates UUID format
print('✓ Conversion generates valid UUIDs')

# Test UUID uniqueness across options
option_ids = [opt.option_id for opt in quiz_card.options]
assert len(set(option_ids)) == 4, 'UUIDs not unique'
print('✓ UUIDs are unique')

print('\n✅ All schema tests passed!')
"
  </verify>
  <done>
- LLMQuizOption, LLMQuizCard, LLMQuizSet schemas created without option_id field
- field_validators working for display_label and options count/correctness
- Conversion functions generate valid UUID4s
- UUIDs are unique within a quiz card
  </done>
</task>

<task type="auto">
  <name>Update quizzer agent to use LLM schemas and generate UUIDs</name>
  <files>server/agents/quizzer.py</files>
  <action>
Update the quizzer agent to use the new LLM schemas:

1. **Update imports** (line 86):
   ```python
   from server.schemas.learning import (
       LLMQuizCard,
       LLMQuizSet,
       QuizCard,
       QuizSet,
       TopicNode,
       convert_llm_to_quiz_card,
       convert_llm_to_quiz_set,
   )
   ```

2. **Update system prompt** (QUIZZER_SYSTEM_PROMPT, around line 168-178):
   - Remove the line: `- **id**: "A", "B", "C", or "D" (unique IDs)`
   - Update the options specification to:
     ```
     2. **options**: EXACTLY 4 options with:
        - **display_label**: "A", "B", "C", or "D" (user-facing label)
        - **text**: The option text
        - **is_correct**: true for exactly ONE option, false for others
        - **explanation**: Required explanation (see above)
     ```
   - Update the example output structure to use display_label instead of id

3. **Update generate_quiz method** (around line 519-527):
   - Change: `response_model=QuizCard` → `response_model=LLMQuizCard`
   - After generation, convert: `quiz = convert_llm_to_quiz_card(quiz)`
   - Remove the line: `quiz = self._fix_option_ids(quiz)` (no longer needed)

4. **Update generate_quiz_set method** (around line 554-560):
   - Change: `response_model=QuizSet` → `response_model=LLMQuizSet`
   - After generation, convert: `quiz_set = convert_llm_to_quiz_set(quiz_set)`
   - Remove the line: `quiz_set = self._fix_quiz_set_option_ids(quiz_set)` (no longer needed)

5. **Keep or simplify _fix_option_ids methods** (optional):
   - Option A: Remove entirely (cleaner - UUID generation is now explicit in conversion functions)
   - Option B: Keep as safety net but simplify to just check for duplicates
   - Recommendation: Remove since conversion functions guarantee valid UUIDs

6. **Update single quiz delegation path** (around line 543-549):
   - The single quiz path calls generate_quiz which now returns QuizCard directly
   - Wrap in QuizSet: `return QuizSet(quizzes=[single_quiz], current_index=0)`
   - This is already correct, just verify it still works
  </action>
  <verify>
cd server && python -c "
import asyncio
from unittest.mock import AsyncMock, patch

# Mock the instructor client
with patch('server.agents.base.instructor_client.create_structured', new_callable=AsyncMock) as mock_create:
    from server.agents.quizzer import quizzer_agent
    from server.schemas.learning import LLMQuizCard, LLMQuizSet, LLMQuizOption, TopicNode
    
    # Test single quiz generation
    mock_llm_card = LLMQuizCard(
        question_text='Test question?',
        options=[
            LLMQuizOption(display_label='A', text='Correct', is_correct=True, explanation='Correct!'),
            LLMQuizOption(display_label='B', text='Wrong1', is_correct=False, explanation='Wrong!'),
            LLMQuizOption(display_label='C', text='Wrong2', is_correct=False, explanation='Wrong!'),
            LLMQuizOption(display_label='D', text='Wrong3', is_correct=False, explanation='Wrong!'),
        ],
        difficulty='medium'
    )
    mock_create.return_value = mock_llm_card
    
    topic = TopicNode(index=0, title='Test', summary_for_context='Summary', key_terms=['term'])
    
    result = asyncio.run(quizzer_agent.generate_quiz(topic=topic, content='Content'))
    
    # Verify it returns QuizCard (not LLMQuizCard)
    from server.schemas.learning import QuizCard
    assert isinstance(result, QuizCard), f'Expected QuizCard, got {type(result)}'
    
    # Verify option_ids are UUIDs
    import uuid
    for opt in result.options:
        uuid.UUID(opt.option_id)
    
    print('✓ Single quiz generation works and returns QuizCard with UUID option_ids')
    
    # Test quiz set generation
    mock_llm_set = LLMQuizSet(quizzes=[mock_llm_card], current_index=0)
    mock_create.return_value = mock_llm_set
    
    result_set = asyncio.run(quizzer_agent.generate_quiz_set(topic=topic, content='Content', quiz_count=1))
    
    from server.schemas.learning import QuizSet
    assert isinstance(result_set, QuizSet), f'Expected QuizSet, got {type(result_set)}'
    
    # Verify all option_ids are UUIDs
    for quiz in result_set.quizzes:
        for opt in quiz.options:
            uuid.UUID(opt.option_id)
    
    print('✓ Quiz set generation works and returns QuizSet with UUID option_ids')

print('\n✅ Quizzer agent updated successfully!')
"
  </verify>
  <done>
- Quizzer agent imports and uses LLM schemas for generation
- System prompt updated to remove id field reference
- generate_quiz returns QuizCard with backend-generated UUIDs
- generate_quiz_set returns QuizSet with backend-generated UUIDs
- _fix_option_ids methods removed or simplified
  </done>
</task>

<task type="auto">
  <name>Update tests for new quiz generation architecture</name>
  <files>server/tests/test_quizzer_agent.py</files>
  <action>
Update the test file to reflect the new architecture:

1. **Update imports** (around line 71-83):
   ```python
   from server.schemas.learning import (
       LLMQuizCard,
       LLMQuizOption,
       LLMQuizSet,
       QuizCard,
       QuizDifficulty,
       QuizOption,
       QuizSet,
       TopicNode,
       convert_llm_to_quiz_card,
       convert_llm_to_quiz_set,
   )
   ```

2. **Add helper functions for LLM schemas** (after _make_stable_uuid):
   ```python
   def _make_mock_llm_option(label: str, is_correct: bool = False) -> LLMQuizOption:
       """Create a mock LLMQuizOption for testing."""
       return LLMQuizOption(
           display_label=label,
           text=f"Option {label} text",
           is_correct=is_correct,
           explanation=f"Explanation for option {label}",
       )
   
   def _make_mock_llm_quiz_card() -> LLMQuizCard:
       """Create a mock LLMQuizCard for testing."""
       return LLMQuizCard(
           question_text="What is the main concept of Test Topic 0?",
           options=[
               _make_mock_llm_option("A", is_correct=True),
               _make_mock_llm_option("B"),
               _make_mock_llm_option("C"),
               _make_mock_llm_option("D"),
           ],
           difficulty=QuizDifficulty.MEDIUM,
       )
   
   def _make_mock_llm_quiz_set(quiz_count: int) -> LLMQuizSet:
       """Create a mock LLMQuizSet with a deterministic difficulty gradient."""
       difficulty_sequences = {
           1: ["medium"],
           2: ["easy", "hard"],
           3: ["easy", "medium", "hard"],
           4: ["easy", "medium", "medium", "hard"],
           5: ["easy", "easy", "medium", "hard", "hard"],
       }
       bounded_count = max(1, min(5, quiz_count))
       sequence = difficulty_sequences[bounded_count]
       quizzes = []
       
       for i, difficulty in enumerate(sequence):
           quizzes.append(
               LLMQuizCard(
                   question_text=f"Question {i + 1} for topic set",
                   options=[
                       _make_mock_llm_option("A", is_correct=True),
                       _make_mock_llm_option("B"),
                       _make_mock_llm_option("C"),
                       _make_mock_llm_option("D"),
                   ],
                   difficulty=difficulty,
               )
           )
       
       return LLMQuizSet(quizzes=quizzes, current_index=0)
   ```

3. **Update test class TestQuizzerAgentGenerate** (around line 354-483):
   - Change mock return values to use LLM schemas: `mock_create.return_value = _make_mock_llm_quiz_card()`
   - Add assertions to verify the returned result is QuizCard (not LLMQuizCard):
     ```python
     self.assertIsInstance(result, QuizCard)
     # Verify option_ids were generated (UUID format)
     import uuid
     for opt in result.options:
         uuid.UUID(opt.option_id)
     ```

4. **Update test class TestQuizzerAgentGenerateQuizSet** (around line 486-1007):
   - Update all mock return values to use LLM schemas: `mock_create.return_value = _make_mock_llm_quiz_set(N)`
   - Update tests that previously tested _fix_option_ids:
     - `test_generate_quiz_set_fixes_option_ids` → Rename to `test_generate_quiz_set_generates_option_ids`
     - Instead of mocking letter IDs, verify UUIDs are generated
   - Update `test_generate_quiz_set_unique_option_ids_across_quizzes` to use LLM schemas
   - Remove `test_generate_quiz_set_fixes_fake_uuid_option_ids` (no longer needed - we generate UUIDs ourselves)

5. **Add new test class for conversion functions** (after existing classes):
   ```python
   class TestLLMToStorageConversion(unittest.TestCase):
       """Tests for LLM schema to storage schema conversion."""
       
       def test_convert_llm_to_quiz_card_generates_uuids(self):
           """Conversion should generate UUIDs for all options."""
           llm_card = _make_mock_llm_quiz_card()
           quiz_card = convert_llm_to_quiz_card(llm_card)
           
           self.assertIsInstance(quiz_card, QuizCard)
           self.assertEqual(len(quiz_card.options), 4)
           
           # All options should have UUID option_ids
           import uuid
           for opt in quiz_card.options:
               uuid.UUID(opt.option_id)
       
       def test_convert_llm_to_quiz_set_generates_unique_uuids(self):
           """Conversion should generate unique UUIDs across all quizzes."""
           llm_set = _make_mock_llm_quiz_set(3)
           quiz_set = convert_llm_to_quiz_set(llm_set)
           
           self.assertIsInstance(quiz_set, QuizSet)
           
           # Collect all option_ids across all quizzes
           all_option_ids = [
               opt.option_id for quiz in quiz_set.quizzes for opt in quiz.options
           ]
           
           # Should be 12 unique UUIDs (3 quizzes × 4 options)
           self.assertEqual(len(all_option_ids), 12)
           self.assertEqual(len(set(all_option_ids)), 12)
       
       def test_conversion_preserves_all_other_fields(self):
           """Conversion should preserve text, is_correct, explanation, display_label."""
           llm_card = LLMQuizCard(
               question_text="Test question?",
               options=[
                   LLMQuizOption(
                       display_label="A",
                       text="Correct answer",
                       is_correct=True,
                       explanation="This is correct because...",
                   ),
                   LLMQuizOption(
                       display_label="B",
                       text="Wrong answer",
                       is_correct=False,
                       explanation="This is wrong because...",
                   ),
                   LLMQuizOption(display_label="C", text="C", is_correct=False, explanation="C"),
                   LLMQuizOption(display_label="D", text="D", is_correct=False, explanation="D"),
               ],
               difficulty="hard",
           )
           
           quiz_card = convert_llm_to_quiz_card(llm_card)
           
           self.assertEqual(quiz_card.question_text, "Test question?")
           self.assertEqual(quiz_card.difficulty, "hard")
           
           # Verify each option preserved its fields
           for i, (llm_opt, quiz_opt) in enumerate(zip(llm_card.options, quiz_card.options)):
               self.assertEqual(quiz_opt.display_label, llm_opt.display_label)
               self.assertEqual(quiz_opt.text, llm_opt.text)
               self.assertEqual(quiz_opt.is_correct, llm_opt.is_correct)
               self.assertEqual(quiz_opt.explanation, llm_opt.explanation)
   ```

6. **Update TestQuizzerDifficultyValidation** (around line 1009-1131):
   - Change `_make_quiz_set_for_difficulties` to use LLM schemas and convert
   - Or keep using QuizCard since this tests difficulty validation which is schema-agnostic

7. **Run all tests to ensure everything passes**:
   - Some tests may need minor adjustments for field names or assertions
  </action>
  <verify>
cd server && python -m unittest server.tests.test_quizzer_agent -v 2>&1 | head -100
  </verify>
  <done>
- All test classes updated to use LLM schemas for mocking
- New tests added for conversion functions
- All existing tests pass
- Removed tests for _fix_option_ids workaround (no longer needed)
  </done>
</task>

</tasks>

<verification>
After completing all tasks:

1. **Schema verification**:
   ```bash
   cd server && python -c "
   from server.schemas.learning import LLMQuizOption, LLMQuizCard, LLMQuizSet, QuizOption
   # LLM schemas should NOT have option_id
   assert 'option_id' not in LLMQuizOption.model_fields
   # Storage schemas SHOULD have option_id
   assert 'option_id' in QuizOption.model_fields
   print('✓ Schema separation verified')
   "
   ```

2. **Integration verification**:
   ```bash
   cd server && python -m unittest server.tests.test_quizzer_agent 2>&1 | tail -5
   # Should show: OK or all tests passed
   ```

3. **Backward compatibility**:
   ```bash
   cd server && python -c "
   # Verify legacy conversion functions still work
   from server.schemas.learning import convert_legacy_quiz_card
   legacy = {
       'question_text': 'Test?',
       'options': [
           {'id': 'A', 'text': 'A', 'is_correct': True, 'explanation': 'A'},
           {'id': 'B', 'text': 'B', 'is_correct': False, 'explanation': 'B'},
           {'id': 'C', 'text': 'C', 'is_correct': False, 'explanation': 'C'},
           {'id': 'D', 'text': 'D', 'is_correct': False, 'explanation': 'D'},
       ],
       'difficulty': 'easy'
   }
   result = convert_legacy_quiz_card(legacy)
   assert len(result.options) == 4
   print('✓ Backward compatibility preserved')
   "
   ```
</verification>

<success_criteria>
- [ ] LLMQuizOption, LLMQuizCard, LLMQuizSet schemas created without option_id
- [ ] Conversion functions generate valid UUID4s and map all other fields correctly
- [ ] Quizzer agent updated to use LLM schemas for generation
- [ ] System prompt updated to remove id field reference
- [ ] generate_quiz and generate_quiz_set return QuizCard/QuizSet with backend-generated UUIDs
- [ ] All existing tests pass
- [ ] New tests for conversion functions added and passing
- [ ] Backward compatibility with legacy quiz formats preserved
- [ ] No reference to _fix_option_ids in main flow (removed or simplified)
</success_criteria>

<output>
After completion, create `.planning/quick/3-refactor-quiz-generation-remove-option-i/3-SUMMARY.md`
</output>
