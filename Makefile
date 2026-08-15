# HugMesh host-shell Makefile — repo-local developer targets.
#
# `make pentest` mirrors the centralized OWASP pen-test CI stage
# (.gitlab-ci.yml -> pentest:sca / pentest:dast, which extend the generator's
# /tests/pentest/ci/pentest-stage.gitlab-ci.yml) so you can run the same checks
# locally before pushing. Nothing here hard-fails when tooling or a target is
# absent — it degrades to a note, matching the additive/non-breaking CI posture.

SHELL := /bin/bash

# Generator repo carrying the shared DAST harness (tests/pentest/run-pentest.sh)
# and the SCA Dependency-Check job definition. Override if vendored elsewhere.
GENERATOR_REPO   ?= https://github.com/hugmesh/hugmesh-generator.git
GENERATOR_REF    ?= main
PENTEST_HARNESS  ?= ../hugmesh-generator/tests/pentest

# DAST target: when set, the full ZAP/probe/nuclei harness runs against it.
DAST_TARGET_URL  ?=

# Dependency-Check (Java tool, run via docker like CI does) — optional local SCA
# parity beyond `npm audit`. Override the version/image if needed.
DEPCHECK_IMAGE   ?= owasp/dependency-check:latest

.PHONY: pentest pentest-sca pentest-dast

## pentest: run the local SCA self-scan + (when DAST_TARGET_URL set) the DAST harness
pentest: pentest-sca pentest-dast
	@echo "[pentest] done. CI runs the full harness via pentest:sca / pentest:dast (.gitlab-ci.yml)."

## pentest-sca: Software Composition Analysis over this repo's dependencies
pentest-sca:
	@echo "[pentest:sca] npm audit (Angular SCA — mirrors CI dependency-check posture)"
	@if command -v npm >/dev/null 2>&1; then \
		npm audit --audit-level=high || echo "[pentest:sca] npm audit reported findings (non-blocking locally; CI gates via Dependency-Check)."; \
	else \
		echo "[pentest:sca] npm not found — skipping npm audit."; \
	fi
	@echo "[pentest:sca] (optional) full OWASP Dependency-Check parity with CI:"
	@echo "    docker run --rm -v \"$$PWD:/src\" $(DEPCHECK_IMAGE) \\"
	@echo "      --project hugmesh.net --scan /src --failOnCVSS 7 \\"
	@echo "      --enableExperimental --format HTML --out /src/reports/sca"

## pentest-dast: delegate to the shared DAST harness against $DAST_TARGET_URL
pentest-dast:
	@if [ -z "$(DAST_TARGET_URL)" ]; then \
		echo "[pentest:dast] DAST_TARGET_URL not set — skipping DAST (set it to run the full harness)."; \
		echo "[pentest:dast] e.g.: make pentest DAST_TARGET_URL=https://localhost"; \
	elif [ -x "$(PENTEST_HARNESS)/run-pentest.sh" ]; then \
		echo "[pentest:dast] running shared harness against $(DAST_TARGET_URL)"; \
		PENTEST_TARGET_URL="$(DAST_TARGET_URL)" bash "$(PENTEST_HARNESS)/run-pentest.sh" --env compose --scan baseline --pipeline main; \
	else \
		echo "[pentest:dast] harness not found at $(PENTEST_HARNESS)/run-pentest.sh"; \
		echo "[pentest:dast] clone it, then re-run:"; \
		echo "    git clone --depth 1 -b $(GENERATOR_REF) $(GENERATOR_REPO) ../hugmesh-generator"; \
		echo "    bash $(PENTEST_HARNESS)/run-pentest.sh --env compose --scan baseline --pipeline main"; \
	fi
