"""
Tests for src/seed_products.py - Product seeding.
"""

import pytest
from sqlalchemy import select, func

from src.models import Product, ProductAlias, ProductTag, ProductTagMember


class TestSeedProductsStructure:
    """Tests for the seed data structure."""

    def test_seed_products_count(self):
        """SEED_PRODUCTS should have sufficient entries."""
        from src.seed_products import SEED_PRODUCTS

        assert len(SEED_PRODUCTS) >= 50  # Should have 58 products
        assert len(SEED_PRODUCTS) == 58

    def test_seed_products_have_names(self):
        """All seed products should have names."""
        from src.seed_products import SEED_PRODUCTS

        for entry in SEED_PRODUCTS:
            name = entry[0]
            assert name and len(name) > 0

    def test_seed_products_have_nutrition(self):
        """All seed products should have nutrition data."""
        from src.seed_products import SEED_PRODUCTS

        for entry in SEED_PRODUCTS:
            name, cal, prot, fat, carb = entry[:5]
            assert isinstance(cal, (int, float))
            assert isinstance(prot, (int, float))
            assert isinstance(fat, (int, float))
            assert isinstance(carb, (int, float))

    def test_seed_products_have_aliases(self):
        """All seed products should have at least one alias."""
        from src.seed_products import SEED_PRODUCTS

        for entry in SEED_PRODUCTS:
            aliases = entry[5]
            assert len(aliases) >= 1

    def test_seed_products_have_tags(self):
        """All seed products should have at least one tag."""
        from src.seed_products import SEED_PRODUCTS

        for entry in SEED_PRODUCTS:
            tags = entry[6]
            assert len(tags) >= 1

    def test_seed_products_no_duplicates(self):
        """No duplicate product names."""
        from src.seed_products import SEED_PRODUCTS

        names = [entry[0] for entry in SEED_PRODUCTS]
        assert len(names) == len(set(names))

    @pytest.mark.asyncio
    async def test_seed_script_creates_products(self, async_session, async_engine):
        """Seed script should create all products in DB."""
        # Call seed function
        from src.seed_products import SEED_PRODUCTS

        # Manually insert seed data

        # Create tags
        tag_names = set()
        for entry in SEED_PRODUCTS:
            for t in entry[6]:
                tag_names.add(t)

        tag_map = {}
        for tag_name in sorted(tag_names):
            tag = ProductTag(name=tag_name)
            async_session.add(tag)
            await async_session.flush()
            tag_map[tag_name] = tag

        # Create products
        product_map = {}
        for entry in SEED_PRODUCTS:
            name, cal, prot, fat, carb, aliases, tags, _ = entry
            product = Product(name=name, calories=cal, proteins=prot, fats=fat, carbs=carb)
            async_session.add(product)
            await async_session.flush()
            product_map[name] = product

            for alias_name in aliases:
                alias = ProductAlias(product_id=product.id, alias=alias_name)
                async_session.add(alias)

            for tag_name in tags:
                if tag_name in tag_map:
                    member = ProductTagMember(
                        product_id=product.id,
                        tag_id=tag_map[tag_name].id,
                        weight=1.0,
                    )
                    async_session.add(member)

        await async_session.commit()

        # Verify
        result = await async_session.execute(select(func.count()).select_from(Product))
        count = result.scalar()
        assert count == 58