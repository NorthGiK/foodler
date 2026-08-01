"""
Tests for src/ai_sections.py - AI response formatting.
"""

from src.ai_sections import _coerce_sections


class TestCoerceSections:
    """Tests for AI section coercion."""

    def test_empty_string(self):
        """Empty string should return empty list."""
        result = _coerce_sections("")
        assert result == []

    def test_whitespace_only(self):
        """Whitespace-only string should return empty list."""
        result = _coerce_sections("   \n  \t  ")
        assert result == []

    def test_valid_json_array(self):
        """Should parse valid JSON array."""
        json_str = '[{"type": "text", "title": "Test", "text": "Hello"}]'
        result = _coerce_sections(json_str)
        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert result[0]["title"] == "Test"
        assert result[0]["text"] == "Hello"

    def test_multiple_sections(self):
        """Should parse multiple sections."""
        json_str = """[
            {"type": "text", "title": "Section 1", "text": "Content 1"},
            {"type": "score", "title": "Score", "value": 85, "max": 100}
        ]"""
        result = _coerce_sections(json_str)
        assert len(result) == 2
        assert result[0]["type"] == "text"
        assert result[1]["type"] == "score"

    def test_try_parse_broken_json(self):
        """Should handle malformed JSON gracefully."""
        json_str = '{"type": "text", "title": "Test"}'  # object, not array
        result = _coerce_sections(json_str)
        assert len(result) == 1  # single text section fallback
        assert result[0]["type"] == "text"

    def test_plain_text_fallback(self):
        """Plain text should be wrapped in a text section."""
        result = _coerce_sections("Простой текстовый ответ")
        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert result[0]["title"] == "Ответ"
        assert result[0]["text"] == "Простой текстовый ответ"

    def test_json_with_code_block(self):
        """Should extract JSON from markdown code block."""
        text = """```json
[{"type": "text", "title": "Test", "text": "Content"}]
```"""
        result = _coerce_sections(text)
        assert len(result) == 1
        assert result[0]["type"] == "text"

    def test_complex_section_types(self):
        """Should handle various section types."""
        json_str = """[
            {"type": "list", "title": "Items", "items": ["a", "b", "c"]},
            {"type": "chart", "title": "Chart", "labels": ["Jan", "Feb"], "values": [10, 20], "kind": "bar"},
            {"type": "products", "title": "Products", "products": [{"name": "Milk", "price": 50}]}
        ]"""
        result = _coerce_sections(json_str)
        assert len(result) == 3
        assert result[0]["items"] == ["a", "b", "c"]
        assert result[1]["kind"] == "bar"
        assert result[2]["products"][0]["name"] == "Milk"

    def test_none_input(self):
        """None input should return empty list."""
        result = _coerce_sections(None)
        assert result == []

    def test_extract_json_from_text(self):
        """Should extract JSON array from surrounding text."""
        text = "Here is the result:\n[{\"type\": \"text\", \"title\": \"T\", \"text\": \"C\"}]\nThat's all."
        result = _coerce_sections(text)
        assert len(result) == 1
        assert result[0]["title"] == "T"