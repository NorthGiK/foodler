from src.product_categories import normalize_category


def test_category_normalization_is_case_insensitive_and_accepts_legacy_aliases():
    assert normalize_category("Бытовая химия") == "бытовые товары"
    assert normalize_category("Замороженные продукты") == "заморозка"
    assert normalize_category("Кондитерские изделия") == "кондитерские"
    assert normalize_category("Молочные продукты") == "молочные"
    assert normalize_category("МОЛОЧЕНЫЕ") == "молочные"
    assert normalize_category("Рыба и морепродукты") == "рыба"
    assert normalize_category("Фрукты") == "фрукты"
    assert normalize_category("Хлеб и выпечка") == "хлеб"


def test_unknown_category_does_not_leak_as_a_second_category():
    assert normalize_category("  UNKNOWN  ") == "прочее"
