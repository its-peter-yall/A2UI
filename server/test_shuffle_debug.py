"""
Test script to verify quiz option shuffling is working correctly.
Run from the server directory with: python test_shuffle_debug.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from schemas.learning import QuizCard, QuizOption
from services.quiz_randomization import (
    shuffle_quiz_options,
    get_or_create_shuffle_order,
)
import uuid

# Create a quiz where option A (first option) is correct
quiz = QuizCard(
    question_text="What is 2+2?",
    options=[
        QuizOption(
            option_id=str(uuid.uuid4()),
            display_label="A",
            text="4 (correct)",
            is_correct=True,
            explanation="Correct!",
        ),
        QuizOption(
            option_id=str(uuid.uuid4()),
            display_label="B",
            text="3",
            is_correct=False,
            explanation="Wrong!",
        ),
        QuizOption(
            option_id=str(uuid.uuid4()),
            display_label="C",
            text="5",
            is_correct=False,
            explanation="Wrong!",
        ),
        QuizOption(
            option_id=str(uuid.uuid4()),
            display_label="D",
            text="22",
            is_correct=False,
            explanation="Wrong!",
        ),
    ],
    difficulty="easy",
)

print("=== Original Quiz ===")
for opt in quiz.options:
    print(f"  {opt.display_label}: {opt.text} (correct={opt.is_correct})")

print("\n=== Testing shuffle_quiz_options (CSPRNG) ===")
position_counts = {"A": 0, "B": 0, "C": 0, "D": 0}
num_iterations = 100

for i in range(num_iterations):
    shuffled = shuffle_quiz_options(quiz)
    # Find where the correct answer ended up
    for idx, opt in enumerate(shuffled.options):
        if opt.is_correct:
            position_counts[opt.display_label] += 1
            break

print(f"\nAfter {num_iterations} shuffles, correct answer position distribution:")
for label, count in position_counts.items():
    percentage = (count / num_iterations) * 100
    print(f"  Position {label}: {count} times ({percentage:.1f}%)")

# Check if distribution is roughly even (should be ~25% each)
is_balanced = all(
    15 <= (count / num_iterations) * 100 <= 35 for count in position_counts.values()
)
print(f"\nDistribution appears balanced: {is_balanced}")

print("\n=== Testing get_or_create_shuffle_order ===")
shuffled1, seed1 = get_or_create_shuffle_order(
    quiz, existing_seed=None, quiz_set_seed=None
)
print(f"First call - Generated seed: {seed1}")
for opt in shuffled1.options:
    print(f"  {opt.display_label}: {opt.text} (correct={opt.is_correct})")

shuffled2, seed2 = get_or_create_shuffle_order(
    quiz, existing_seed=seed1, quiz_set_seed=None
)
print(f"\nSecond call with same seed - Seed: {seed2}")
for opt in shuffled2.options:
    print(f"  {opt.display_label}: {opt.text} (correct={opt.is_correct})")

# Verify same seed produces same order
same_order = all(
    shuffled1.options[i].option_id == shuffled2.options[i].option_id for i in range(4)
)
print(f"\nSame seed produces same order: {same_order}")

print("\n=== Summary ===")
if is_balanced and same_order:
    print("SUCCESS: Shuffle is working correctly!")
    print("  - Distribution is roughly even across all positions")
    print("  - Same seed produces deterministic (repeatable) shuffle")
else:
    print("ISSUE DETECTED:")
    if not is_balanced:
        print("  - Distribution is NOT balanced")
    if not same_order:
        print("  - Same seed does NOT produce same order")
