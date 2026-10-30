#!/usr/bin/env python3
"""
GitHub Progress Tracker Utility for Weather Forecasting Project.
Interacts with Sujay-kulal/Weather-Forecasting-Using-Machine-Learning
using stored git credentials via the GitHub REST API.
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

REPO_OWNER = "Sujay-kulal"
REPO_NAME = "Weather-Forecasting-Using-Machine-Learning"
API_BASE = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"


def get_github_token() -> str:
    """Retrieve GitHub token safely from git credential helper."""
    # Check env first
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        return token.strip()

    # Query git credential helper
    try:
        proc = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n",
            capture_output=True,
            text=True,
            check=True,
        )
        for line in proc.stdout.splitlines():
            if line.startswith("password="):
                return line.split("=", 1)[1].strip()
    except Exception as e:
        print(f"Error querying git credential helper: {e}", file=sys.stderr)

    return ""


def github_request(endpoint: str, method: str = "GET", data: dict = None) -> dict:
    """Make authenticated request to GitHub REST API."""
    token = get_github_token()
    if not token:
        raise RuntimeError("No GitHub token available from git credentials or environment.")

    url = f"{API_BASE}{endpoint}" if endpoint.startswith("/") else endpoint
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "Antigravity-Agent",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        error_detail = e.read().decode("utf-8")
        print(f"GitHub API HTTP {e.code} Error on {method} {url}: {error_detail}", file=sys.stderr)
        raise


def list_issues(state: str = "all"):
    """List repository issues."""
    return github_request(f"/issues?state={state}&per_page=100")


def create_issue(title: str, body: str, labels: list = None) -> dict:
    """Create a new GitHub issue."""
    payload = {"title": title, "body": body}
    if labels:
        payload["labels"] = labels
    return github_request("/issues", method="POST", data=payload)


def add_comment(issue_number: int, comment: str) -> dict:
    """Add a comment to an existing issue."""
    return github_request(f"/issues/{issue_number}/comments", method="POST", data={"body": comment})


def update_issue(issue_number: int, data: dict) -> dict:
    """Update issue status or body."""
    return github_request(f"/issues/{issue_number}", method="PATCH", data=data)


def main():
    parser = argparse.ArgumentParser(description="GitHub Milestone Progress Tracker")
    subparsers = parser.add_subparsers(dest="command")

    # list
    list_p = subparsers.add_parser("list", help="List all issues")
    list_p.add_argument("--state", default="all", choices=["open", "closed", "all"])

    # create
    create_p = subparsers.add_parser("create", help="Create an issue")
    create_p.add_argument("--title", required=True)
    create_p.add_argument("--body-file", help="File containing markdown body")
    create_p.add_argument("--body", help="Inline markdown body")
    create_p.add_argument("--label", action="append", default=[])

    # comment
    comment_p = subparsers.add_parser("comment", help="Add comment to issue")
    comment_p.add_argument("--issue", type=int, required=True)
    comment_p.add_argument("--comment-file", help="File containing comment")
    comment_p.add_argument("--comment", help="Inline markdown comment")

    # close
    close_p = subparsers.add_parser("close", help="Close an issue")
    close_p.add_argument("--issue", type=int, required=True)

    args = parser.parse_args()

    if args.command == "list":
        issues = list_issues(state=args.state)
        print(f"Total issues found: {len(issues)}")
        for iss in issues:
            # skip PRs returned in issues endpoint
            is_pr = "pull_request" in iss
            kind = "PR" if is_pr else "Issue"
            print(f"[{kind}] #{iss['number']}: {iss['title']} ({iss['state']})")

    elif args.command == "create":
        body = args.body or ""
        if args.body_file:
            with open(args.body_file, "r", encoding="utf-8") as f:
                body = f.read()
        res = create_issue(args.title, body, labels=args.label)
        print(f"Created issue #{res['number']}: {res['html_url']}")

    elif args.command == "comment":
        comment = args.comment or ""
        if args.comment_file:
            with open(args.comment_file, "r", encoding="utf-8") as f:
                comment = f.read()
        res = add_comment(args.issue, comment)
        print(f"Added comment {res['id']} to issue #{args.issue}: {res['html_url']}")

    elif args.command == "close":
        res = update_issue(args.issue, {"state": "closed"})
        print(f"Closed issue #{res['number']}: {res['html_url']}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
