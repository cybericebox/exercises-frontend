import json
import os
import tempfile
import unittest

import line_gate as lg


def f(name, add=1, dele=0, prev=None):
    d = {"filename": name, "additions": add, "deletions": dele}
    if prev:
        d["previous_filename"] = prev
    return d


class SizeTests(unittest.TestCase):
    def test_small_change_passes(self):
        self.assertEqual(lg.problems([f("a.go", 30, 10)], 1), [])

    def test_limit_is_inclusive(self):
        self.assertEqual(lg.problems([f("a.go", 300, 100)], 1), [])
        self.assertEqual(len(lg.problems([f("a.go", 300, 101)], 1)), 1)

    def test_lines_are_summed_over_files(self):
        files = [f("a.go", 200), f("b.go", 150, 51)]
        self.assertEqual(len(lg.problems(files, 2)), 1)

    def test_generated_files_and_lock_files_are_not_counted(self):
        files = [
            f("go.sum", 900),
            f("package-lock.json", 900),
            f("internal/delivery/repository/postgres/events.sql.go", 500),
            f("internal/delivery/repository/postgres/models.go", 500),
            f("internal/delivery/repository/postgres/querier.go", 500),
            f("internal/delivery/repository/postgres/db.go", 500),
            f("internal/delivery/controller/http/handler/apidocs/docs.go", 500),
            f("internal/delivery/controller/http/handler/apidocs/swagger.json", 500),
            f("internal/delivery/controller/http/handler/apidocs/swagger.yaml", 500),
            f("error-catalog/errors.en.json", 500),
            f("main.go", 10),
        ]
        self.assertEqual(lg.changed_lines(files), 10)
        self.assertEqual(lg.problems(files, len(files)), [])

    def test_a_hand_written_file_with_a_similar_name_is_counted(self):
        self.assertEqual(lg.changed_lines([f("internal/x/models.go", 7), f("docs/go.sum.md", 3)]), 10)

    def test_override_label_waives_the_size_only(self):
        big = [f("a.go", 900)]
        self.assertEqual(lg.problems(big, 1, labels=["large-fix"]), [])
        self.assertEqual(len(lg.problems(big, 1, labels=["other"])), 1)
        harness = [f(".github/workflows/check.yml", 1)]
        self.assertEqual(len(lg.problems(harness, 1, labels=["large-fix"])), 1)


class ProtectedTests(unittest.TestCase):
    def test_harness_is_refused(self):
        for name in [".github/workflows/check.yml", ".github/scripts/ci.sh", ".github/CODEOWNERS", "mise.toml", "mise-tasks/test-scripts",
                     "hack/x.sh", "scripts/dev.sh", "scripts/sync-ds.mjs", "scripts/test-nginx-tls.sh", "tools/checkroutes/main.go",
                     ".golangci.yml", ".golangci.yaml", "eslint.config.mjs", "vitest.config.ts", "vitest.setup.ts", "playwright.config.ts",
                     ".eslintrc", ".eslintrc.json"]:
            self.assertEqual(len(lg.problems([f(name)], 1)), 1, name)

    def test_product_files_are_allowed(self):
        for name in ["internal/a.go", "Dockerfile", "deploy/Dockerfile", "deploy/cfg-check.sh", "package.json", "src/app/page.tsx",
                     "src/app/page.test.tsx", "tests/docker/nginx.sh", "README.md", "docs/mise.toml.md", "x/scripts/a.go", "src/tools/a.ts",
                     "src/eslint.config.mjs"]:
            self.assertEqual(lg.problems([f(name)], 1), [], name)

    def test_rename_away_from_a_protected_path_is_refused(self):
        self.assertEqual(len(lg.problems([f("internal/x.sh", 1, 1, prev=".github/scripts/ci.sh")], 1)), 1)


class CompletenessTests(unittest.TestCase):
    def test_short_list_fails_closed(self):
        self.assertEqual(len(lg.problems([f("a.go")], 2)), 1)

    def test_empty_list_for_a_non_empty_change_fails(self):
        self.assertEqual(len(lg.problems([], 5)), 1)

    def test_cap_fails(self):
        files = [f(f"{i}.go", 0) for i in range(3000)]
        self.assertEqual(len(lg.problems(files, 3000)), 1)

    def test_bad_changed_files_fails(self):
        self.assertEqual(len(lg.problems([f("a.go")], None)), 1)


class DependencyTests(unittest.TestCase):
    def test_every_listed_lock_file_is_not_counted(self):
        for name in lg.LOCK_FILES:
            self.assertEqual(lg.changed_lines([f(name, 900, 800)]), 0, name)

    def test_the_lists_are_what_this_repository_has(self):
        self.assertIn("go.sum", lg.LOCK_FILES)
        self.assertIn("go.work.sum", lg.LOCK_FILES)
        self.assertIn("package-lock.json", lg.LOCK_FILES)

    def test_a_dependency_security_patch_passes(self):
        files = [f("go.mod", 4, 4), f("go.sum", 1200, 1100), f("internal/x/x.go", 6, 3), f("internal/x/x_test.go", 20, 0)]
        self.assertEqual(lg.problems(files, len(files)), [])
        files = [f("package.json", 2, 2), f("package-lock.json", 3000, 2900)]
        self.assertEqual(lg.problems(files, len(files)), [])

    def test_a_lock_file_in_another_place_is_counted(self):
        for name in ["sub/go.sum", "go.sum.bak", "docs/go.sum", "charts/other/Chart.lock", "package-lock.json/x", "Go.Sum"]:
            self.assertEqual(lg.changed_lines([f(name, 10)]), 10, name)

    def test_go_mod_is_counted(self):
        self.assertEqual(lg.changed_lines([f("go.mod", 30, 20)]), 50)

    def test_generated_trees_are_not_counted_and_lookalikes_are(self):
        for name in ["internal/delivery/repository/postgres/users.sql.go", "internal/delivery/repository/postgres/db.go",
                     "internal/delivery/controller/http/handler/apidocs/swagger.yaml", "error-catalog/errors.en.json"]:
            self.assertEqual(lg.changed_lines([f(name, 500)]), 0, name)
        for name in ["internal/delivery/repository/postgres/acquire.go", "internal/delivery/repository/postgres/queries/users.sql",
                     "internal/delivery/repository/postgres/sub/users.sql.go", "internal/delivery/controller/http/handler/apidocs/x.go",
                     "error-catalog/errors.uk.json", "src/error-catalog/errors.en.json", "x/models.go"]:
            self.assertEqual(lg.changed_lines([f(name, 7)]), 7, name)


class CliTests(unittest.TestCase):
    def run_cli(self, files, n, labels=""):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "files.json")
            with open(p, "w", encoding="utf-8") as fh:
                json.dump(files, fh)
            argv = ["check", "--files", p, "--changed-files", str(n)]
            if labels:
                argv += ["--labels", labels]
            return lg.main(argv)

    def test_exit_codes(self):
        self.assertEqual(self.run_cli([f("a.go", 5)], 1), 0)
        self.assertEqual(self.run_cli([f("a.go", 500)], 1), 1)
        self.assertEqual(self.run_cli([f("a.go", 500)], 1, "bug,large-fix"), 0)


class BypassTests(unittest.TestCase):
    def test_other_mise_and_tool_config_is_protected(self):
        for name in [".mise/config.toml", "mise/config.toml", ".config/mise.toml", ".config/mise/config.toml", ".config/mise/conf.d/a.toml",
                     "mise.local.toml", ".mise.toml", "mise.ci.toml", ".mise-tasks/lint", "mise/tasks/lint", ".tool-versions", "sub/mise.toml",
                     ".golangci.toml", ".golangci.json", ".GitHub/x".replace("GitHub", "github"), "Scripts/dev.sh", "MISE.TOML", "HACK/x.sh",
                     "Tools/x.go", "ESLint.config.js"]:
            self.assertEqual(len(lg.problems([f(name)], 1)), 1, name)

    def test_a_name_alone_does_not_lower_the_count(self):
        for name in ["internal/go.sum", "docs/package-lock.json", "src/package-lock.json", "internal/delivery/repository/postgres/evil.sql.go.txt",
                     "internal/delivery/repository/postgres/models.go.bak", "error-catalog/errors.en.json.tmp"]:
            self.assertEqual(lg.changed_lines([f(name, 500)]), 500, name)

    def test_the_real_generated_paths_are_still_not_counted(self):
        for name in ["go.sum", "package-lock.json", "internal/delivery/repository/postgres/querier.go",
                     "internal/delivery/controller/http/handler/apidocs/docs.go"]:
            self.assertEqual(lg.changed_lines([f(name, 500)]), 0, name)

    def test_file_names_in_the_message_cannot_forge_workflow_commands(self):
        msg = " ".join(lg.problems([f(".github/x\n::error::forged")], 1))
        self.assertNotIn("\n", msg)


if __name__ == "__main__":
    unittest.main()
