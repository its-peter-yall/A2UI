"""
============================================================================
FILE: test_mermaid_validator.py
LOCATION: server/tests/test_mermaid_validator.py
============================================================================
PURPOSE:
    Unit tests for the Mermaid diagram syntax validator.
ROLE IN PROJECT:
    Ensures correct parsing behavior, validating correct Mermaid charts and
    detecting syntax errors.
KEY COMPONENTS:
    - TestMermaidValidator: Unit test cases
DEPENDENCIES:
    - External: unittest
    - Internal: server.utils.mermaid_validator
USAGE:
    python -m unittest server/tests/test_mermaid_validator.py
============================================================================
"""

import unittest

from server.utils.mermaid_validator import validate_mermaid_code


class TestMermaidValidator(unittest.TestCase):
    def test_valid_flowchart(self):
        valid_chart = """
        flowchart TD
            A[Start] --> B(Process)
            B --> C{Decision}
            C -- Yes --> D[[Subprocess]]
            C -- No --> E[(Database)]
            D & E --> F(((End)))
        """
        self.assertIsNone(validate_mermaid_code(valid_chart))

    def test_invalid_quotes_and_brackets(self):
        # Missing connector
        chart1 = """
        flowchart TD
            A["Pipeline is Modular"] L["Loaders"]
        """
        err1 = validate_mermaid_code(chart1)
        self.assertIsNotNone(err1)
        self.assertIn("Invalid node/syntax", err1)

        # Unescaped nested quotes
        chart2 = """
        flowchart TD
            A["Node "Nested" Text"] --> B
        """
        err2 = validate_mermaid_code(chart2)
        self.assertIsNotNone(err2)

        # Unclosed bracket
        chart3 = """
        flowchart TD
            A[Start --> B
        """
        err3 = validate_mermaid_code(chart3)
        self.assertIsNotNone(err3)

    def test_valid_nested_escaped_quotes(self):
        # Escaped quotes are valid
        chart = """
        flowchart TD
            A["Node \\"Nested\\" Text"] --> B
        """
        self.assertIsNone(validate_mermaid_code(chart))

    def test_other_diagram_types(self):
        # Sequence diagram with balanced quotes should be valid
        seq = """
        sequenceDiagram
            Alice->>Bob: Hello Bob, how are you?
            Bob-->>Alice: Jolly good!
        """
        self.assertIsNone(validate_mermaid_code(seq))

        # Sequence diagram with unmatched quotes
        seq_invalid = """
        sequenceDiagram
            Alice->>Bob: Hello "Bob
        """
        self.assertIsNotNone(validate_mermaid_code(seq_invalid))
