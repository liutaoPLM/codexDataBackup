import importlib.util
from pathlib import Path

import pytest

SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "skills"
    / "gh-address-comments"
    / "scripts"
    / "fetch_comments.py"
)
SPEC = importlib.util.spec_from_file_location("github_fetch_comments_test", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SCRIPT}")
FETCH_COMMENTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FETCH_COMMENTS)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://github.com/upstream/project/pull/42", ("upstream", "project", 42)),
        (
            "https://github.enterprise.example/team/service/pull/42",
            ("team", "service", 42),
        ),
    ],
)
def test_current_pr_ref_uses_base_repository(monkeypatch, url, expected) -> None:
    requested_fields = []

    def fake_pr_view(fields):
        requested_fields.append(fields)
        return {"number": 42, "url": url}

    monkeypatch.setattr(FETCH_COMMENTS, "gh_pr_view_json", fake_pr_view)

    assert FETCH_COMMENTS.get_current_pr_ref() == expected
    assert requested_fields == ["number,url"]


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/upstream/project/issues/42",
        "https://github.com/upstream/project/pull/99",
    ],
)
def test_current_pr_ref_rejects_mismatched_or_non_pr_url(monkeypatch, url) -> None:
    monkeypatch.setattr(
        FETCH_COMMENTS,
        "gh_pr_view_json",
        lambda fields: {"number": 42, "url": url},
    )

    with pytest.raises(RuntimeError, match="PR base repository"):
        FETCH_COMMENTS.get_current_pr_ref()


def test_fetch_all_does_not_repeat_completed_connections(monkeypatch) -> None:
    calls = []

    def connection(node, cursor=None):
        return {
            "nodes": [{"id": node}],
            "pageInfo": {"hasNextPage": cursor is not None, "endCursor": cursor},
        }

    pages = iter(
        [
            {
                "comments": connection("comment-1"),
                "reviews": connection("review-1", "reviews-next"),
                "reviewThreads": connection("thread-1"),
            },
            {
                "comments": connection("comment-1"),
                "reviews": connection("review-2"),
                "reviewThreads": connection("thread-1"),
            },
        ]
    )

    def fake_graphql(owner, repo, number, comments_cursor, reviews_cursor, threads_cursor):
        calls.append((comments_cursor, reviews_cursor, threads_cursor))
        page = next(pages)
        return {
            "data": {
                "repository": {
                    "pullRequest": {
                        "number": number,
                        "url": "https://github.com/upstream/project/pull/42",
                        "title": "Test pull request",
                        "state": "OPEN",
                        **page,
                    }
                }
            }
        }

    monkeypatch.setattr(FETCH_COMMENTS, "gh_api_graphql", fake_graphql)

    result = FETCH_COMMENTS.fetch_all("upstream", "project", 42)

    assert result["conversation_comments"] == [{"id": "comment-1"}]
    assert result["reviews"] == [{"id": "review-1"}, {"id": "review-2"}]
    assert result["review_threads"] == [{"id": "thread-1"}]
    assert calls == [(None, None, None), (None, "reviews-next", None)]
