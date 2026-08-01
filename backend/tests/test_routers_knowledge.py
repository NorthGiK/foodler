"""
Tests for knowledge base API endpoints - /api/products/*, /api/recipes/*, /api/analytics/*, /api/fridge, /api/tags
"""

import pytest
from httpx import AsyncClient


class TestSearchProducts:
    """Tests for GET /api/products/search"""

    @pytest.mark.asyncio
    async def test_search_products(self, client: AsyncClient, test_products):
        """Should search products by name."""
        response = await client.get("/api/products/search?query=молоко")
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "молоко"
        assert len(data["results"]) > 0
        names = [p["name"] for p in data["results"]]
        assert any("Молоко" in name for name in names)

    @pytest.mark.asyncio
    async def test_search_empty_query(self, client: AsyncClient):
        """Should reject empty query."""
        response = await client.get("/api/products/search?query=")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_search_no_results(self, client: AsyncClient):
        """Should return empty results for non-existent product."""
        response = await client.get("/api/products/search?query=zxqjkl")
        assert response.status_code == 200
        assert response.json()["results"] == []


class TestGetProduct:
    """Tests for GET /api/products/{product_id}"""

    @pytest.mark.asyncio
    async def test_get_product_by_id(self, client: AsyncClient, test_product):
        """Should get product by ID."""
        response = await client.get(f"/api/products/{test_product.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_product.id
        assert data["name"] == "Молоко 3.2%"
        assert data["calories"] == 60
        assert data["aliases"] == ["молоко 3.2"]

    @pytest.mark.asyncio
    async def test_get_nonexistent_product(self, client: AsyncClient):
        """Should return 404 for non-existent product."""
        response = await client.get("/api/products/nonexistent_id")
        assert response.status_code == 404


class TestCreateProduct:
    """Tests for POST /api/products"""

    @pytest.mark.asyncio
    async def test_create_product_minimal(self, client: AsyncClient):
        """Should create a product with minimal data."""
        response = await client.post(
            "/api/products",
            json={
                "name": "Новый продукт",
                "calories": 100,
                "proteins": 5,
                "fats": 2,
                "carbs": 15,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "новый продукт"  # normalized
        assert data["calories"] == 100

    @pytest.mark.asyncio
    async def test_create_product_with_aliases_and_tags(self, client: AsyncClient):
        """Should create product with aliases and tags."""
        response = await client.post(
            "/api/products",
            json={
                "name": "Тестовый продукт",
                "calories": 200,
                "proteins": 10,
                "fats": 8,
                "carbs": 20,
                "aliases": ["тест", "test product"],
                "tags": ["молочка", "напитки"],
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data["aliases"]) == 2
        assert len(data["tags"]) == 2


class TestMatchProduct:
    """Tests for POST /api/products/match"""

    @pytest.mark.asyncio
    async def test_match_by_name(self, client: AsyncClient, test_product):
        """Should match product by name."""
        response = await client.post(
            "/api/products/match",
            json={"raw_name": "Молоко 3.2%", "quantity": 1},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["product"] is not None
        assert data["confidence"] > 0

    @pytest.mark.asyncio
    async def test_match_by_fuzzy(self, client: AsyncClient, test_products):
        """Should match product by fuzzy search."""
        response = await client.post(
            "/api/products/match",
            json={"raw_name": "молочко", "quantity": 1},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["product"] is not None
        assert data["matched_by"] == "fuzzy"

    @pytest.mark.asyncio
    async def test_match_no_result(self, client: AsyncClient):
        """Should return no match for unknown product."""
        response = await client.post(
            "/api/products/match",
            json={"raw_name": "zxqjkl_unknown", "quantity": 1},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["product"] is None
        assert data["matched_by"] == "none"


class TestGetSubstitutes:
    """Tests for GET /api/products/{product_id}/substitutes"""

    @pytest.mark.asyncio
    async def test_get_substitutes(self, client: AsyncClient, test_product):
        """Should return substitutes for product."""
        response = await client.get(f"/api/products/{test_product.id}/substitutes")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestRecipes:
    """Tests for /api/recipes endpoints"""

    @pytest.mark.asyncio
    async def test_list_recipes(self, client: AsyncClient, test_recipe):
        """Should list recipes."""
        response = await client.get("/api/recipes")
        assert response.status_code == 200
        recipes = response.json()
        assert len(recipes) > 0
        assert recipes[0]["name"] == "Куриный суп"

    @pytest.mark.asyncio
    async def test_get_recipe_by_id(self, client: AsyncClient, test_recipe):
        """Should get recipe by ID."""
        response = await client.get(f"/api/recipes/{test_recipe.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_recipe.id
        assert len(data["ingredients"]) == 3

    @pytest.mark.asyncio
    async def test_create_recipe(self, client: AsyncClient, test_products):
        """Should create a new recipe."""
        milk, kefir, chicken, carrot = test_products
        response = await client.post(
            "/api/recipes",
            json={
                "name": "Овощной салат",
                "instructions": '["Нарезать овощи", "Смешать"]',
                "cooking_time_minutes": 15,
                "tags": ["салат", "обед"],
                "ingredients": [
                    {
                        "product_id": carrot.id,
                        "product_name": "Морковь",
                        "quantity": 3,
                        "unit": "шт",
                        "importance_score": 0.8,
                    }
                ],
            },
        )
        assert response.status_code == 201
        assert response.json()["name"] == "Овощной салат"


class TestAnalytics:
    """Tests for /api/analytics endpoints"""

    @pytest.mark.asyncio
    async def test_spending_analysis(self, client: AsyncClient, auth_headers, test_receipts):
        """Should return spending analysis."""
        response = await client.get("/api/analytics/spending", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["receipt_count"] == 3

    @pytest.mark.asyncio
    async def test_nutrition_analysis(self, client: AsyncClient, auth_headers, test_receipt):
        """Should return nutrition analysis."""
        response = await client.get("/api/analytics/nutrition", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_calories" in data
        assert data["total_calories"] > 0


class TestFridge:
    """Tests for /api/fridge endpoint"""

    @pytest.mark.asyncio
    async def test_fridge_status(self, client: AsyncClient, auth_headers, test_receipt):
        """Should return fridge status."""
        response = await client.get("/api/fridge", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) > 0


class TestTags:
    """Tests for /api/tags endpoint"""

    @pytest.mark.asyncio
    async def test_list_tags(self, client: AsyncClient, test_products):
        """Should list all tags."""
        response = await client.get("/api/tags")
        assert response.status_code == 200
        tags = response.json()
        assert len(tags) > 0
        tag_names = [t["name"] for t in tags]
        assert "молочка" in tag_names
        assert "мясо" in tag_names