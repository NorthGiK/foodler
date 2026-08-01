SHELL := /bin/bash

.PHONY: bootstrap dev dev-backend dev-mobile check test backend-check mobile-check \
	backend-test mobile-test contract contract-check secrets

bootstrap:
	cd backend && uv sync --all-extras
	cd mobile && npm ci

dev:
	$(MAKE) -j2 dev-backend dev-mobile

dev-backend:
	cd backend && uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

dev-mobile:
	cd mobile && npm run start

check: backend-check mobile-check contract-check secrets

test: backend-test mobile-test

backend-check:
	cd backend && uv run ruff check src tests scripts

mobile-check:
	cd mobile && npm run lint
	cd mobile && npm run format:check
	cd mobile && npm run typecheck

backend-test:
	cd backend && uv run pytest

mobile-test:
	cd mobile && npm run test -- --runInBand

contract:
	cd backend && uv run python -m scripts.export_openapi ../contracts/openapi.json
	cd mobile && npm run generate:api

contract-check: contract
	git diff --exit-code -- contracts/openapi.json mobile/src/api/generated

secrets:
	backend/.venv/bin/detect-secrets -c 1 scan \
		--exclude-files 'mobile/package-lock.json|backend/uv.lock|contracts/openapi.json|mobile/src/api/generated/.*' \
		--baseline .secrets.baseline
	git diff --exit-code --ignore-matching-lines='"generated_at":' -- .secrets.baseline
	git restore -- .secrets.baseline
