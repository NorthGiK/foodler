import json
from pathlib import Path

from src.product_categories import infer_category_from_name


def test_shared_regression_corpus():
    corpus = json.loads((Path(__file__).parents[2] / "contracts/product-category-regression.json").read_text())
    assert {row["name"]: infer_category_from_name(row["name"]) or "прочее" for row in corpus} == {
        row["name"]: row["category"] for row in corpus
    }
