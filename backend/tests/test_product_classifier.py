"""Tests for the structured AI product-category classifier."""

from unittest.mock import AsyncMock, patch

import pytest

from src.integrations.product_classifier import (
    ProductClassifierError,
    classify_product_category,
)


@pytest.mark.asyncio
async def test_classifier_accepts_valid_canonical_category():
    with patch(
        "src.integrations.product_classifier.get_http_session",
        new=AsyncMock(return_value=_Session('{"category":"бакалея","confidence":0.91}')),
    ):
        result = await classify_product_category("Фирменный продукт 500г")

    assert result == {"category": "бакалея", "confidence": 0.91}


@pytest.mark.asyncio
async def test_classifier_rejects_category_outside_taxonomy():
    with (
        patch(
            "src.integrations.product_classifier.get_http_session",
            new=AsyncMock(return_value=_Session('{"category":"неизвестная","confidence":0.99}')),
        ),
        pytest.raises(ProductClassifierError),
    ):
        await classify_product_category("Фирменный продукт 500г")


class _Response:
    ok = True

    def __init__(self, content: str):
        self.content = content

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def json(self):
        return {"response": [{"message": {"content": self.content}}]}


class _Session:
    def __init__(self, content: str):
        self.content = content

    def post(self, *_args, **_kwargs):
        return _Response(self.content)
