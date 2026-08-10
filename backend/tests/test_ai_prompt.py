from src.ai_prompt import create_prompt


def test_create_prompt_requests_markdown_and_renders_markers():
    prompt = create_prompt(
        "save-money",
        {"parameters": {"budget": 5000}, "context": {"receipts": []}},
    )

    assert prompt is not None
    assert "'budget': 5000" in prompt
    assert "action =" not in prompt
    assert "(action =" not in prompt
    assert "Возвращай только обычный Markdown-текст" in prompt
    assert "Не возвращай JSON" in prompt
    assert "{INPUT_DATA}" not in prompt
    assert "{ACTION}" not in prompt


def test_overall_analysis_prompt_has_no_service_action_blocks():
    prompt = create_prompt("overall-analysis", {"context": {}})

    assert prompt is not None
    assert "action =" not in prompt
    assert "служебные" in prompt
    assert "снизить расходы" in prompt
    assert "состав продуктов" in prompt
    assert "900–1500 символов" in prompt
    assert "ровно такую структуру" in prompt


def test_create_prompt_returns_none_for_unknown_action():
    assert create_prompt("unknown", {}) is None
