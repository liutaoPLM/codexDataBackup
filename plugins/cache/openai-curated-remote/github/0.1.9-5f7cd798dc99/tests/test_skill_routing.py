import re
from pathlib import Path

import pytest

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = PLUGIN_ROOT / "skills"
EXPECTED_SKILLS = {"github", "gh-address-comments", "gh-fix-ci", "yeet"}
GITHUB_ROOT = SKILLS_ROOT / "github"
REVIEW_ROOT = SKILLS_ROOT / "gh-address-comments"
CI_ROOT = SKILLS_ROOT / "gh-fix-ci"
PUBLISH_ROOT = SKILLS_ROOT / "yeet"
PUBLISH_WORKFLOW_HEADING = "## Publish GitHub Changes"
CI_HELPER = GITHUB_ROOT / "scripts" / "inspect_pr_checks.py"
LEGACY_CI_HELPER = SKILLS_ROOT / "gh-fix-ci" / "scripts" / "inspect_pr_checks.py"


def skill_text(skill_name: str) -> str:
    return (SKILLS_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")


def normalized_skill(skill_name: str) -> str:
    return " ".join(skill_text(skill_name).casefold().split())


def publish_workflow_text() -> str:
    github = skill_text("github")
    section = re.search(
        rf"(?m)^{re.escape(PUBLISH_WORKFLOW_HEADING)}\s*$\n(?P<body>.*?)(?=^##\s|\Z)",
        github,
        re.DOTALL,
    )

    assert section is not None, "GitHub must own the inline publishing workflow"
    return section.group("body")


def normalized_publish_workflow() -> str:
    return " ".join(publish_workflow_text().casefold().split())


def test_github_plugin_exposes_exactly_four_intent_specific_skills() -> None:
    discoverable = {path.parent.name for path in SKILLS_ROOT.glob("*/SKILL.md")}

    assert discoverable == EXPECTED_SKILLS
    for skill_name in EXPECTED_SKILLS:
        text = skill_text(skill_name)
        name = re.search(r"(?m)^name:\s*[\"']?([a-z0-9-]+)[\"']?\s*$", text)
        assert name is not None, skill_name
        assert name.group(1) == skill_name


@pytest.mark.parametrize("skill_name", sorted(EXPECTED_SKILLS))
def test_github_agent_metadata_routes_to_its_retained_skill(skill_name: str) -> None:
    metadata_path = SKILLS_ROOT / skill_name / "agents" / "openai.yaml"
    metadata = metadata_path.read_text(encoding="utf-8")

    assert f"${skill_name}" in metadata
    if skill_name != "gh-fix-ci":
        assert "$gh-fix-ci" not in metadata


def test_github_agent_metadata_owns_publication_instead_of_delegating_it() -> None:
    metadata = (GITHUB_ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")
    normalized = " ".join(metadata.casefold().split())

    assert "publish" in normalized or "publication" in normalized
    assert "review" in normalized
    assert "route publication" not in normalized
    assert "dedicated guarded skill" not in normalized


@pytest.mark.parametrize("skill_name", ("gh-fix-ci", "yeet"))
def test_compatibility_aliases_are_explicit_only_while_github_remains_implicit(
    skill_name: str,
) -> None:
    specialist_metadata = (SKILLS_ROOT / skill_name / "agents" / "openai.yaml").read_text(
        encoding="utf-8"
    )
    github_metadata = (GITHUB_ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")

    assert re.search(
        r"(?m)^policy:[ \t]*\n  allow_implicit_invocation:[ \t]*false[ \t]*$",
        specialist_metadata,
    )
    assert f"${skill_name}" in specialist_metadata
    assert "../github/SKILL.md" in skill_text(skill_name)

    github_policy = re.search(
        r"(?m)^  allow_implicit_invocation:[ \t]*(true|false)[ \t]*$",
        github_metadata,
    )
    assert github_policy is None or github_policy.group(1) == "true"
    assert "$github" in github_metadata


def test_ci_specialist_remains_a_thin_compatibility_entry_point() -> None:
    ci_skill = skill_text("gh-fix-ci")
    github_path = "../github/SKILL.md"

    assert github_path in ci_skill
    assert (CI_ROOT / github_path).resolve() == (GITHUB_ROOT / "SKILL.md").resolve()
    assert "CI inspection workflow" in ci_skill
    assert "gh pr checks" not in ci_skill
    assert "gh run view" not in ci_skill


def test_general_github_skill_routes_review_and_owns_publication_workflow() -> None:
    github = skill_text("github")
    review_path = "../gh-address-comments/SKILL.md"

    assert review_path in github
    assert (GITHUB_ROOT / review_path).resolve() == (REVIEW_ROOT / "SKILL.md").resolve()
    assert PUBLISH_WORKFLOW_HEADING in github
    assert "../yeet/SKILL.md" not in github

    normalized = normalized_skill("github")
    assert "review" in normalized
    assert "publish" in normalized or "publication" in normalized
    assert "base repository" in normalized


def test_yeet_remains_a_compatibility_entry_point_for_the_github_workflow() -> None:
    yeet = skill_text("yeet")
    github_path = "../github/SKILL.md"

    assert github_path in yeet
    assert (PUBLISH_ROOT / github_path).resolve() == (GITHUB_ROOT / "SKILL.md").resolve()
    assert "Publish GitHub Changes" in yeet


def test_yeet_compatibility_entry_point_does_not_duplicate_publication_policy() -> None:
    yeet = normalized_skill("yeet")

    for authoritative_policy in (
        "each require explicit authorization",
        "requesting one action never authorizes the others",
        "git add -- <paths>",
        "create at most one pr",
        "never blindly retry",
        "`draft: true`",
        "<head-owner>:<branch>",
    ):
        assert authoritative_policy not in yeet


def test_consolidated_ci_helper_is_directly_linked_and_scoped() -> None:
    github = skill_text("github")
    normalized = normalized_skill("github")

    assert CI_HELPER.is_file()
    assert "scripts/inspect_pr_checks.py" in github
    assert (GITHUB_ROOT / "scripts/inspect_pr_checks.py").resolve() == CI_HELPER.resolve()
    assert "--repo <matching-checkout>" in normalized
    assert "--pr <full-pr-url>" in normalized
    assert "report external check" in normalized


def test_external_ci_checks_preserve_urls_and_separate_provider_follow_up() -> None:
    github = normalized_skill("github")
    external_policy = re.search(r"\breport external checks?\b(?P<policy>[^.;]*)", github)

    assert external_policy is not None
    policy = external_policy.group("policy")
    assert re.search(r"\burls?\b", policy)
    assert re.search(r"\b(?:separate[- ]provider|provider)\s+follow[- ]up\b", policy)


def test_legacy_ci_entry_point_is_only_a_compatibility_shim() -> None:
    if not LEGACY_CI_HELPER.exists():
        return

    legacy = LEGACY_CI_HELPER.read_text(encoding="utf-8")
    assert "runpy" in legacy
    assert "github" in legacy
    assert "inspect_pr_checks.py" in legacy


def test_review_specialist_uses_authoritative_base_repository_threads() -> None:
    review = normalized_skill("gh-address-comments")

    assert "authoritative review threads" in review
    assert "base repository" in review
    assert "flat comments" in review
    assert "current patch" in review
    assert "outdated" in review
    assert "scripts/fetch_comments.py" in review
    assert (REVIEW_ROOT / "scripts/fetch_comments.py").is_file()
    assert "current-branch base pr" in review


def test_review_local_fix_never_authorizes_remote_or_publication_mutations() -> None:
    review = normalized_skill("gh-address-comments")

    assert all(term in review for term in ("replies", "reviews", "thread resolution"))
    assert "each require explicit authorization" in review
    assert "local fixes never authorize remote writes, commits, or pushes" in review
    assert "approved thread" in review
    assert "thread id" in review
    assert "never a comment id" in review


def test_publish_operations_require_separate_explicit_authorization() -> None:
    publish = normalized_publish_workflow()

    operations = "stage, commit, push, and pr creation each require"
    assert f"{operations} explicit authorization" in publish or (
        f"{operations} authorization" in publish and "each must be explicitly requested" in publish
    )
    assert "requesting one action never authorizes the others" in publish
    assert "push only when authorized" in publish or "push only when requested" in publish


def test_publish_preserves_mixed_worktree_scope_without_blanket_staging() -> None:
    publish = publish_workflow_text()
    normalized = normalized_publish_workflow()

    assert "staged and unstaged" in normalized
    assert "mixed worktree" in normalized
    assert "ask which files" in normalized or "ask which paths" in normalized
    assert "git add -- <paths>" in publish
    assert (
        "stage only confirmed paths" in normalized or "never stage unrelated changes" in normalized
    )
    for forbidden in ("git add -a", "git add .", "git add --all"):
        position = normalized.find(forbidden)
        if position >= 0:
            assert re.search(r"\bnever\b", normalized[max(0, position - 90) : position])


def test_publish_preserves_requested_branch_and_never_pushes_implicitly() -> None:
    publish = normalized_publish_workflow()

    assert "default branch" in publish
    assert "before committing" in publish
    assert "current" in publish or "requested branch" in publish
    assert "push only when authorized" in publish or "push only when requested" in publish
    assert "scoped changes" in publish or "staged scope" in publish


def test_publish_reuses_existing_pr_and_never_retries_a_remote_write_blindly() -> None:
    publish = normalized_publish_workflow()

    assert "reuse an existing matching pr" in publish
    assert "create at most one pr" in publish
    assert "uncertain" in publish
    assert "verify read-only" in publish
    assert "never blindly retry" in publish


def test_publish_preserves_explicit_draft_and_cross_repository_contracts() -> None:
    publish = normalized_publish_workflow()

    assert "`draft: true`" in publish
    assert "`draft: false`" in publish
    assert "explicitly requested" in publish
    assert "exactly one" in publish
    assert "`base`/`head`" in publish
    assert "`base_branch`/`head_branch`" in publish
    assert "same-organization" in publish
    assert "`head_repo`" in publish
    assert "<head-owner>:<branch>" in publish
