#!/usr/bin/env python3
"""
Extract course code + course title pairs from copied course catalogue text.

Usage:
  python extract_courses.py input.txt -o courses.json

Input example:
  CLAS1005
  Ancient Rome: History, Culture, and Society
  Second Semester    Undergraduate    6    In Person

Output example:
  [
    {
      "code": "CLAS1005",
      "title": "Ancient Rome: History, Culture, and Society",
      "search": "CLAS1005 Ancient Rome: History, Culture, and Society"
    }
  ]
"""

import argparse
import json
import re
from pathlib import Path


COURSE_CODE_RE = re.compile(r"^[A-Z]{4}\d{4}$")


def extract_courses(text: str) -> list[dict[str, str]]:
    """
    Extract course code/title pairs.

    Assumes each valid course code is on its own line and the course title is
    the next non-empty line.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    courses: list[dict[str, str]] = []

    for index, line in enumerate(lines):
        if COURSE_CODE_RE.match(line):
            if index + 1 < len(lines):
                title = lines[index + 1]

                # Avoid accidentally treating another course code as a title.
                if not COURSE_CODE_RE.match(title):
                    courses.append(
                        {
                            "code": line,
                            "title": title,
                            "search": f"{line} {title}",
                        }
                    )

    return courses


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract course codes and titles from raw course catalogue text."
    )
    parser.add_argument("input_file", help="Path to the raw text file.")
    parser.add_argument(
        "-o",
        "--output",
        default="courses.json",
        help="Output JSON file path. Defaults to courses.json.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON with indentation.",
    )

    args = parser.parse_args()

    input_path = Path(args.input_file)
    output_path = Path(args.output)

    text = input_path.read_text(encoding="utf-8")
    courses = extract_courses(text)

    output_path.write_text(
        json.dumps(
            courses,
            ensure_ascii=False,
            indent=2 if args.pretty else None,
        ),
        encoding="utf-8",
    )

    print(f"Extracted {len(courses)} courses to {output_path}")


if __name__ == "__main__":
    main()
