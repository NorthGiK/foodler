import asyncio
import json
from unittest.mock import AsyncMock, patch

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.models import Product, ProductAlias, ProductCategoryAssignment
from src.product_categorization import (
    CategoryDecision,
    _classify_batch,
    _upsert,
    assignment_key,
    categorize_items,
    extract_gtin,
    is_restricted_gtin,
    is_valid_gtin,
    merchant_fingerprint,
)


class _Response:
    ok = True
    status = 200

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def json(self):
        if isinstance(self.payload, BaseException):
            raise self.payload
        return self.payload


class _Session:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        response = _Response()
        response.payload = self.payload
        return response

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        response = _Response()
        response.payload = self.payload
        return response


class _SequenceSession(_Session):
    def __init__(self, payloads):
        super().__init__(None)
        self.payloads = iter(payloads)

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        response = _Response()
        response.payload = next(self.payloads)
        return response


class _HttpSequenceSession(_Session):
    def __init__(self, responses):
        super().__init__(None)
        self.responses = iter(responses)

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        status, payload = next(self.responses)
        response = _Response()
        response.status = status
        response.ok = status < 400
        response.payload = payload
        return response


def test_extracts_valid_ean13_and_nested_gs1m_without_losing_zeroes():
    assert is_valid_gtin("4006381333931")
    assert extract_gtin({"ean13": {"gtin": "4006381333931"}}) == "4006381333931"
    assert extract_gtin({"future": [{"gs1m": {"gtin": "4006381333931"}}]}) == "4006381333931"
    assert extract_gtin({"fiscalDocumentNumber": "4006381333931"}) is None
    assert extract_gtin({"wrapper": {"futureGtinValue": "04006381333931"}}) == (
        "04006381333931"
    )


def test_restricted_gtin_is_merchant_scoped_and_never_global_without_merchant():
    code = "2010003941512"
    assert is_valid_gtin(code)
    assert is_restricted_gtin(code)
    assert assignment_key("Весовой сыр", code, "Магнит")[:2] == ("merchant_code", code)
    assert assignment_key("Весовой сыр", code, None)[0] == "restricted_unscoped"
    assert merchant_fingerprint("Магнит") != "магнит"


async def test_ai_batch_uses_prompt_json_and_rejects_invalid_rows():
    session = _Session(
        {
            "response": [
                {
                    "message": {
                        "content": '{"items":[{"key":"a","category":"бакалея","confidence":0.9},{"key":"bad","category":"bad","confidence":1}]}'
                    }
                }
            ]
        }
    )
    with patch("src.product_categorization.get_http_session", new=AsyncMock(return_value=session)):
        result = await _classify_batch([{"key": "a", "name": "рис"}])
    assert result["a"].category == "бакалея"
    request = session.calls[0][1]["json"]
    assert "response_format" not in request
    assert "Return only JSON" in request["messages"][0]["content"]


async def test_ai_batch_accepts_fenced_json_and_uses_configured_timeout():
    session = _Session(
        {
            "response": [
                {
                    "message": {
                        "content": "```json\n{\"items\":[{\"key\":\"a\",\"category\":\"бакалея\",\"confidence\":0.9}]}\n```"
                    }
                }
            ]
        }
    )
    with (
        patch("src.product_categorization.AI_TIMEOUT_SECONDS", new=17.0),
        patch("src.product_categorization.get_http_session", new=AsyncMock(return_value=session)),
    ):
        result = await _classify_batch([{"key": "a", "name": "неизвестный товар"}])
    assert result["a"].category == "бакалея"
    request = session.calls[0][1]
    assert request["timeout"].total == 17.0
    assert "response_format" not in request["json"]


async def test_ai_batch_retries_only_missing_rows_from_partial_response():
    first = {
        "response": [
            {
                "message": {
                    "content": '{"items":[{"key":"0","category":"бакалея","confidence":0.9}]}'
                }
            }
        ]
    }
    second = {
        "response": [
            {
                "message": {
                    "content": '{"items":[{"key":"1","category":"фрукты","confidence":0.92}]}'
                }
            }
        ]
    }
    session = _SequenceSession([first, second])
    items = [
        {"key": "0", "name": "очень длинное название бакалейного товара"},
        {"key": "1", "name": "очень длинное название фруктового товара"},
    ]
    with (
        patch("src.product_categorization.get_http_session", new=AsyncMock(return_value=session)),
        patch("src.product_categorization.asyncio.sleep", new=AsyncMock()),
    ):
        result = await _classify_batch(items)
    assert {key: decision.category for key, decision in result.items()} == {
        "0": "бакалея",
        "1": "фрукты",
    }
    assert len(session.calls) == 2
    retried_items = json.loads(session.calls[1][1]["json"]["messages"][1]["content"])
    assert retried_items == [items[1]]


async def test_ai_batch_retries_transient_http_failure_once():
    success = {
        "response": [
            {
                "message": {
                    "content": '{"items":[{"key":"0","category":"бакалея","confidence":0.9}]}'
                }
            }
        ]
    }
    session = _HttpSequenceSession([(429, {}), (200, success)])
    with (
        patch("src.product_categorization.get_http_session", new=AsyncMock(return_value=session)),
        patch("src.product_categorization.asyncio.sleep", new=AsyncMock()) as sleep,
    ):
        result = await _classify_batch([{"key": "0", "name": "неизвестный товар"}])
    assert result["0"].category == "бакалея"
    assert len(session.calls) == 2
    sleep.assert_awaited_once()


async def test_ai_batch_logs_disabled_configuration_without_item_data():
    item_name = "Позиция чека не должна попасть в лог"
    with (
        patch("src.product_categorization.AI_API_KEY", new=""),
        patch("src.product_categorization.logger.warning") as warning,
    ):
        assert await _classify_batch([{"key": "0", "name": item_name}]) == {}
    warning.assert_called_once_with(
        "Receipt category AI is not configured",
        extra={"event": "receipt_category_ai_not_configured", "missing_count": 1},
    )
    assert item_name not in str(warning.call_args)


async def test_ai_batch_degrades_for_malformed_or_missing_response():
    for payload in ({}, {"response": []}, {"response": [{"message": {"content": "not json"}}]}):
        session = _Session(payload)
        with patch("src.product_categorization.get_http_session", new=AsyncMock(return_value=session)):
            assert await _classify_batch([{"key": "a", "name": "x"}]) == {}


async def test_ai_batch_degrades_for_timeout_and_http_failure():
    with patch(
        "src.product_categorization.get_http_session",
        new=AsyncMock(side_effect=TimeoutError()),
    ):
        assert await _classify_batch([{"key": "a", "name": "x"}]) == {}

    session = _Session({})
    response = _Response()
    response.status = 503
    response.ok = False
    response.payload = {}
    session.post = lambda *_args, **_kwargs: response
    with patch("src.product_categorization.get_http_session", new=AsyncMock(return_value=session)):
        assert await _classify_batch([{"key": "a", "name": "x"}]) == {}


async def test_ai_batch_logs_only_safe_error_fields_for_os_error():
    item_name = "Уникальная позиция из чека"
    with (
        patch(
            "src.product_categorization.get_http_session",
            new=AsyncMock(side_effect=OSError("provider unavailable")),
        ),
        patch("src.product_categorization.logger.warning") as warning,
    ):
        assert await _classify_batch([{"key": "a", "name": item_name}]) == {}
    warning.assert_called_once_with(
        "Receipt category AI request failed",
        extra={"event": "receipt_category_ai_failed", "error_type": "OSError"},
    )
    assert item_name not in str(warning.call_args)


async def test_ai_batch_rejects_invalid_confidence_values():
    rows = [
        {"key": "negative", "category": "бакалея", "confidence": -0.1},
        {"key": "large", "category": "бакалея", "confidence": 1.1},
        {"key": "boolean", "category": "бакалея", "confidence": True},
        {"key": "missing", "category": "бакалея"},
    ]
    session = _Session({"response": [{"message": {"content": json.dumps({"items": rows})}}]})
    with patch("src.product_categorization.get_http_session", new=AsyncMock(return_value=session)):
        assert await _classify_batch([{"key": "x", "name": "x"}]) == {}


async def test_unique_unknown_items_use_one_ai_batch_and_confirmed_cache(async_session):
    items = [
        {"name": "товар неизвестный"},
        {"name": "товар неизвестный"},
        {"name": "вторая неизвестная позиция"},
    ]

    async def classify(rows):
        return {
            row["key"]: CategoryDecision("бакалея", "ai", 0.91, model_version="model")
            for row in rows
        }

    classify_mock = AsyncMock(side_effect=classify)
    with patch("src.product_categorization._classify_batch", new=classify_mock):
        decisions = await categorize_items(async_session, items)
    assert [decision.category for decision in decisions] == ["бакалея"] * 3
    classify_mock.assert_awaited_once()
    assert len(classify_mock.await_args.args[0]) == 2
    assert [row["key"] for row in classify_mock.await_args.args[0]] == ["0", "1"]
    await async_session.commit()

    cached_mock = AsyncMock()
    with patch("src.product_categorization._classify_batch", new=cached_mock):
        cached = await categorize_items(async_session, items)
    assert [decision.category for decision in cached] == ["бакалея"] * 3
    cached_mock.assert_not_awaited()
    assert await async_session.scalar(select(func.count()).select_from(ProductCategoryAssignment)) == 2


async def test_local_rules_classify_unambiguous_items_without_ai(async_session):
    expected = {
        "молоко 3.2%": "молочные",
        "рис пропаренный": "бакалея",
        "банан": "фрукты",
    }
    classifier = AsyncMock()
    with patch("src.product_categorization._classify_batch", new=classifier):
        result = await categorize_items(
            async_session, [{"name": name} for name in expected]
        )
    assert [decision.category for decision in result] == list(expected.values())
    assert all(decision.source == "local" for decision in result)
    classifier.assert_not_awaited()


async def test_pet_food_is_local_other_without_ai(async_session):
    classifier = AsyncMock()
    with patch("src.product_categorization._classify_batch", new=classifier):
        result = await categorize_items(async_session, [{"name": "KITEKAT корм для кошек"}])
    assert (result[0].category, result[0].source) == ("прочее", "local")
    classifier.assert_not_awaited()


async def test_low_confidence_is_not_reused(async_session):
    item = {"name": "неуверенная позиция"}
    low = AsyncMock(return_value={"0": CategoryDecision("снеки", "ai", 0.79)})
    with patch("src.product_categorization._classify_batch", new=low):
        assert (await categorize_items(async_session, [item]))[0].category == "снеки"
    await async_session.commit()
    again = AsyncMock(return_value={})
    with patch("src.product_categorization._classify_batch", new=again):
        await categorize_items(async_session, [item])
    again.assert_awaited_once()
    assert await async_session.scalar(select(func.count()).select_from(ProductCategoryAssignment)) == 0


async def test_conflicting_aliases_are_sent_to_classifier(async_session):
    first = Product(name="Первый продукт", category="молочные")
    second = Product(name="Второй продукт", category="бакалея")
    async_session.add_all([first, second])
    await async_session.flush()
    async_session.add_all(
        [
            ProductAlias(product_id=first.id, alias="спорный товар"),
            ProductAlias(product_id=second.id, alias="спорный товар"),
        ]
    )
    await async_session.flush()
    classifier = AsyncMock(return_value={})
    with patch("src.product_categorization._classify_batch", new=classifier):
        await categorize_items(async_session, [{"name": "Спорный товар"}])
    candidates = classifier.await_args.args[0][0]["candidates"]
    assert candidates == ["молочные", "бакалея", "прочее"]


async def test_restricted_code_is_merchant_isolated(async_session):
    item = {"name": "Весовой товар", "gtin": "2010003941512"}
    classifier = AsyncMock(return_value={"0": CategoryDecision("молочные", "ai", 0.95)})
    with patch("src.product_categorization._classify_batch", new=classifier):
        result = await categorize_items(async_session, [item], "Магнит")
    assert result[0].category == "молочные"
    await async_session.commit()

    other_merchant = AsyncMock(return_value={})
    with patch("src.product_categorization._classify_batch", new=other_merchant):
        await categorize_items(async_session, [item], "Пятёрочка")
    other_merchant.assert_awaited_once()


async def test_assignment_upsert_is_atomic_under_concurrent_writers(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'assignments.sqlite'}")
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: ProductCategoryAssignment.__table__.create(sync_connection)
        )
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def write(category: str, confidence: float):
        async with sessions() as session:
            await _upsert(
                session,
                "gtin",
                "4006381333931",
                "",
                CategoryDecision(category, "ai", confidence),
            )
            await session.commit()

    await asyncio.gather(
        write("бакалея", 0.9),
        write("молочные", 0.95),
    )
    async with sessions() as session:
        rows = (await session.scalars(select(ProductCategoryAssignment))).all()
    assert len(rows) == 1
    assert rows[0].category in {"бакалея", "молочные"}
    await engine.dispose()
