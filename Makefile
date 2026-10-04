# Branch cycle (scripts/dev.sh, the same in every repository), see CONTRIBUTING.md:
#   make dev-start NAME=<x>      feature/<x> from the fresh develop
#   make dev-push [MINOR=1]      push, open or update the PR into develop, auto-merge when green (MINOR=1 labels it "minor")
#   make dev-done                back to develop, pull, delete the merged local branch
.PHONY: dev-start dev-push dev-done
dev-start:
	@NAME='$(NAME)' scripts/dev.sh start

dev-push:
	@MINOR='$(MINOR)' scripts/dev.sh push

dev-done:
	@scripts/dev.sh done
