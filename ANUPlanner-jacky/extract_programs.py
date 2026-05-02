#!/usr/bin/env python3
"""
Extract ANU exchange programme rows from anu_programs.xlsx into JSON.

Usage:
  python3 extract_programs.py anu_programs.xlsx -o anu_programs.json
"""

import argparse
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


SPREADSHEET_NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {
    "r": "http://schemas.openxmlformats.org/package/2006/relationships",
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}


def cell_text(element: ET.Element) -> str:
    return "".join(node.text or "" for node in element.findall(".//a:t", SPREADSHEET_NS))


def column_index(cell_ref: str) -> int:
    letters_match = re.match(r"[A-Z]+", cell_ref)

    if not letters_match:
        return 0

    index = 0

    for letter in letters_match.group(0):
        index = index * 26 + ord(letter) - 64

    return index - 1


def load_shared_strings(workbook_zip: ZipFile) -> list[str]:
    try:
        root = ET.fromstring(workbook_zip.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    return [cell_text(item) for item in root.findall("a:si", SPREADSHEET_NS)]


def find_sheet_path(workbook_zip: ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(workbook_zip.read("xl/workbook.xml"))
    rels = ET.fromstring(workbook_zip.read("xl/_rels/workbook.xml.rels"))
    rel_paths = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("r:Relationship", REL_NS)
    }

    for sheet in workbook.findall("a:sheets/a:sheet", REL_NS):
        if sheet.attrib.get("name") == sheet_name:
            rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = rel_paths[rel_id]
            target = target.lstrip("/")
            return target if target.startswith("xl/") else f"xl/{target}"

    raise ValueError(f"Sheet not found: {sheet_name}")


def read_sheet_rows(workbook_zip: ZipFile, sheet_path: str, shared_strings: list[str]) -> list[list[str]]:
    root = ET.fromstring(workbook_zip.read(sheet_path))
    rows = []

    for row in root.findall(".//a:sheetData/a:row", SPREADSHEET_NS):
        values: list[str] = []

        for cell in row.findall("a:c", SPREADSHEET_NS):
            index = column_index(cell.attrib.get("r", "A1"))
            value_node = cell.find("a:v", SPREADSHEET_NS)
            value = "" if value_node is None else value_node.text or ""

            if cell.attrib.get("t") == "s" and value:
                value = shared_strings[int(value)]

            while len(values) <= index:
                values.append("")

            values[index] = value.strip()

        rows.append(values)

    return rows


def extract_programs(xlsx_path: Path, sheet_name: str) -> list[dict[str, str]]:
    with ZipFile(xlsx_path) as workbook_zip:
        shared_strings = load_shared_strings(workbook_zip)
        sheet_path = find_sheet_path(workbook_zip, sheet_name)
        rows = read_sheet_rows(workbook_zip, sheet_path, shared_strings)

    if not rows:
        return []

    header = [value.strip().lower() for value in rows[0]]
    column_lookup = {name: index for index, name in enumerate(header)}

    required_columns = {
        "program name": "name",
        "city": "city",
        "country": "country",
        "region": "region",
    }

    programs = []

    for row in rows[1:]:
        item = {}

        for source_name, output_name in required_columns.items():
            index = column_lookup.get(source_name)
            item[output_name] = row[index].strip() if index is not None and index < len(row) else ""

        if item["name"]:
            item["search"] = " ".join(
                value for value in [item["name"], item["city"], item["country"], item["region"]] if value
            )
            programs.append(item)

    return programs


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract ANU exchange programmes from an XLSX file.")
    parser.add_argument("input_file", help="Path to anu_programs.xlsx.")
    parser.add_argument("-o", "--output", default="anu_programs.json", help="Output JSON file path.")
    parser.add_argument("--sheet", default="ANU Programs", help="Workbook sheet to extract.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print the output JSON.")
    args = parser.parse_args()

    programs = extract_programs(Path(args.input_file), args.sheet)
    Path(args.output).write_text(
        json.dumps(programs, ensure_ascii=False, indent=2 if args.pretty else None),
        encoding="utf-8",
    )
    print(f"Extracted {len(programs)} programs to {args.output}")


if __name__ == "__main__":
    main()
