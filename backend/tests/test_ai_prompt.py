from src.ai_prompt import create_prompt


def test_create_prompt_keeps_literal_json_example_and_renders_markers():
    prompt = create_prompt(
        "save-money",
        {"parameters": {"budget": 5000}, "context": {"receipts": []}},
    )

    assert prompt is not None
    assert "'budget': 5000" in prompt
    assert "## action = `cheaper`" in prompt
    assert '"type": "text"|"score"|"list"|"products"|"chart"' in prompt
    assert "{INPUT_DATA}" not in prompt
    assert "{ACTION}" not in prompt


def test_create_prompt_returns_none_for_unknown_action():
    assert create_prompt("unknown", {}) is None
