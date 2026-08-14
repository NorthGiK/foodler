SHELL := /bin/bash

.PHONY: bootstrap dev dev-backend dev-mobile build-apk build-aab-rustore check test backend-check mobile-check \
	backend-test mobile-test contract contract-check secrets audit backend-audit mobile-audit

bootstrap:
	cd backend && uv sync --all-extras
	cd mobile && npm ci

dev:
	$(MAKE) -j2 dev-backend dev-mobile

dev-backend:
	cd backend && uv run alembic upgrade head
	cd backend && uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

dev-mobile:
	cd mobile && npx expo start -ag

build-apk:
	cd mobile && npx expo prebuild --clean
	cd mobile/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a

build-aab-rustore:
	@test -n "$$RUSTORE_KEYSTORE" || (echo "RUSTORE_KEYSTORE is required" >&2; exit 1)
	@test -f "$$RUSTORE_KEYSTORE" || (echo "RUSTORE_KEYSTORE does not exist: $$RUSTORE_KEYSTORE" >&2; exit 1)
	@test -n "$$RUSTORE_STORE_PASSWORD" || (echo "RUSTORE_STORE_PASSWORD is required" >&2; exit 1)
	@test -n "$$RUSTORE_KEY_PASSWORD" || (echo "RUSTORE_KEY_PASSWORD is required" >&2; exit 1)
	@mkdir -p mobile/dist
	cd mobile && npx expo prebuild --clean
	cd mobile/android && ./gradlew bundleRelease -PreactNativeArchitectures=arm64-v8a \
		-PreleaseStoreFile="$$RUSTORE_KEYSTORE" \
		-PreleaseStorePassword="$$RUSTORE_STORE_PASSWORD" \
		-PreleaseKeyAlias=Foodler \
		-PreleaseKeyPassword="$$RUSTORE_KEY_PASSWORD"
	cp mobile/android/app/build/outputs/bundle/release/app-release.aab mobile/dist/Foodler-RuStore-release.aab
	keytool -exportcert -rfc -alias "Foodler" \
		-keystore "$$RUSTORE_KEYSTORE" -storepass "$$RUSTORE_STORE_PASSWORD" \
		-file mobile/dist/Foodler-RuStore-release.cer.pem
	@echo "AAB: mobile/dist/Foodler-RuStore-release.aab"
	@echo "Certificate: mobile/dist/Foodler-RuStore-release.cer.pem"

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
	cd backend && .venv/bin/python -m scripts.check_secrets

audit: backend-audit

backend-audit:
	cd backend && uv audit --locked

mobile-audit:
	cd mobile && npm run audit:prod
