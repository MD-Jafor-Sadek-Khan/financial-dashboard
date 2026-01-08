#!/usr/bin/env python3
"""
collect_files_content.py

Traverse a folder, concatenate readable file contents into a single output file,
and allow fine-grained ignoring of folders/files (by name, relative path, or glob).

Usage (examples):
  # Default: scan current dir, write all_files_content.txt
  python3 collect_files_content.py

  # Scan a specific project and create a zip of the result
  python3 collect_files_content.py /home/rahman/myproject --output project_dump.txt --zip

  # Provide extra ignore entries on command-line
  python3 collect_files_content.py . --ignore-folder build --ignore-file secret.txt --ignore-glob '*.pyc'

This script is intentionally defensive: tries to read files as text with errors='replace'
so you won't crash on binary files. Default ignore lists are tuned for dev projects on Ubuntu.
"""

from __future__ import annotations
import os
import argparse
import fnmatch
import json
import zipfile
from pathlib import Path
from typing import List, Set

# -------------------------
# Default ignore lists
# -------------------------
DEFAULT_IGNORE_FOLDERS = [
    ".git",
    "node_modules",
    "__pycache__",
    "venv",
    ".venv",
    ".cache",
    ".local",
    ".config",
    "dist",
    "build",
    ".pytest_cache",
    ".ropeproject",
    "lib",
    "tools",
    "debug",
    "description",
    "zen",
    "assets",
    "public",
]

# These entries can be simple file names or relative paths from the root_folder
# and will be matched by exact name or matched against glob patterns if given as glob.
DEFAULT_IGNORE_FILES = [
    ".env",
    ".env.local",
    "id_rsa",
    "id_rsa.pub",
    "authorized_keys",
    ".DS_Store",
    "secret.txt",
    "excalidraw_widget_BK.js",
    "QUICKSTART.md",
    "README.md",
    "all_files_content.txt",
    "package-lock.json",
]

# Default glob patterns (user may extend)
DEFAULT_IGNORE_GLOBS = [
    "*.pyc",
    "*.log",
    "*.sqlite3",
    "*.db",
    "*.so",
    "__pycache__/*",
]


# -------------------------
# Helpers
# -------------------------
def normalize_path_for_matching(p: Path) -> str:
    """
    Return a normalized relative path string using forward slashes
    for consistent glob matching, relative to the root folder later.
    """
    return str(p.as_posix())


# -------------------------
# Core implementation
# -------------------------
def collect_files_content(
    root_folder: str,
    output_filename: str = "all_files_content.txt",
    ignore_folders: List[str] | None = None,
    ignore_files: List[str] | None = None,
    ignore_globs: List[str] | None = None,
    include_extensions: List[str] | None = None,
    create_zip: bool = False,
    verbose: bool = False,
) -> Path:
    """
    Walk through files under root_folder and write their contents to output file.
    Returns the path to the generated output file.

    Parameters:
      - root_folder: path to scan
      - output_filename: name of the file to create inside root_folder
      - ignore_folders: list of folder names or relative folder paths to ignore
      - ignore_files: list of file names or relative file paths to ignore (exact match)
      - ignore_globs: list of glob-style patterns to ignore (applies to relative file paths)
      - include_extensions: if provided, *only* include these file extensions (['.py', '.xml'])
      - create_zip: if True, create a zip containing the output file
      - verbose: prints diagnostics to stdout
    """
    root = Path(root_folder).expanduser().resolve()
    output_path = root.joinpath(output_filename)

    ignore_folders = ignore_folders or []
    ignore_files = ignore_files or []
    ignore_globs = ignore_globs or []
    include_extensions = (
        [e.lower() for e in include_extensions] if include_extensions else None
    )

    # Convert patterns into normalized forms relative to root for matching
    def is_ignored_dir(dir_path: Path) -> bool:
        # Normalize relative path (forward slashes) for comparisons
        try:
            rel = dir_path.relative_to(root)
            rel_str = normalize_path_for_matching(rel)
            parts = list(rel.parts)
        except Exception:
            # dir is not under root (shouldn't happen) -> don't ignore by default
            rel_str = ""
            parts = list(dir_path.parts)

        # 1) If any of the ignore_folders is a component name, skip
        for entry in ignore_folders:
            if not entry:
                continue
            entry_norm = os.path.normpath(entry)
            # If simple name matches any path component:
            if entry_norm in parts:
                if verbose:
                    print(
                        f"[ignore_dir] component match -> {dir_path} (matched {entry})"
                    )
                return True
            # If entry is a relative path, check prefix
            try:
                entry_abs = (root / entry_norm).resolve()
                # If entry_abs is ancestor of dir_path, skip
                if (
                    entry_abs in dir_path.resolve().parents
                    or entry_abs == dir_path.resolve()
                ):
                    if verbose:
                        print(
                            f"[ignore_dir] path prefix match -> {dir_path} (matched {entry})"
                        )
                    return True
            except Exception:
                # skip errors in path resolution
                pass

        return False

    def is_ignored_file(file_path: Path) -> bool:
        # Skip the output file itself
        if file_path.resolve() == output_path.resolve():
            if verbose:
                print(f"[ignore_file] skipping output file itself: {file_path}")
            return True

        # relative path (forward slashes)
        try:
            rel = file_path.relative_to(root)
            rel_str = normalize_path_for_matching(rel)
        except Exception:
            rel_str = normalize_path_for_matching(file_path)

        # Exact name matches
        if file_path.name in ignore_files:
            if verbose:
                print(f"[ignore_file] exact name match -> {file_path}")
            return True

        # Relative path exact matches
        for entry in ignore_files:
            if not entry:
                continue
            entry_norm = os.path.normpath(entry)
            entry_abs = (root / entry_norm).resolve()
            try:
                if entry_abs == file_path.resolve():
                    if verbose:
                        print(
                            f"[ignore_file] relative path match -> {file_path} (matched {entry})"
                        )
                    return True
            except Exception:
                pass

        # Glob patterns against the relative path string
        for pattern in ignore_globs:
            if not pattern:
                continue
            if fnmatch.fnmatch(rel_str, pattern):
                if verbose:
                    print(
                        f"[ignore_file] glob match -> {file_path} (pattern {pattern})"
                    )
                return True

        return False

    # Walk directory tree and write contents
    with output_path.open("w", encoding="utf-8", errors="replace") as out_f:
        out_f.write(f"# Aggregated contents of {root}\n")
        out_f.write(f"# Created by collect_files_content.py\n\n")

        for dirpath, dirnames, filenames in os.walk(root):
            # Convert to Path for convenience
            dirpath_p = Path(dirpath)

            # Remove directories that should be ignored (mutate dirnames to prevent descent)
            new_dirnames = []
            for d in dirnames:
                candidate = dirpath_p.joinpath(d)
                if is_ignored_dir(candidate):
                    if verbose:
                        print(f"[walk] skipping descending into {candidate}")
                    # do not add to new_dirnames -> os.walk won't descend
                else:
                    new_dirnames.append(d)
            dirnames[:] = new_dirnames

            # If current dir itself matches ignore rules, skip entirely
            if is_ignored_dir(dirpath_p):
                if verbose:
                    print(f"[walk] skipping directory {dirpath_p}")
                continue

            for fname in filenames:
                file_path = dirpath_p.joinpath(fname)

                # Optionally filter by extension whitelist
                if include_extensions:
                    if file_path.suffix.lower() not in include_extensions:
                        if verbose:
                            print(f"[walk] skipping by extension {file_path}")
                        continue

                if is_ignored_file(file_path):
                    continue

                # Write header and contents
                rel_path_display = (
                    file_path.relative_to(root) if file_path.exists() else file_path
                )
                out_f.write("\n" + "=" * 80 + "\n")
                out_f.write(f"📄 FILE: {rel_path_display}\n")
                out_f.write("=" * 80 + "\n\n")
                try:
                    # Read as text, replace invalid bytes (errors='replace')
                    with file_path.open(
                        "r", encoding="utf-8", errors="replace"
                    ) as f_in:
                        out_f.write(f_in.read())
                except Exception as e:
                    out_f.write(f"[Could not read file: {e}]\n")
                out_f.write("\n\n")

    if verbose:
        print(f"✅ Wrote aggregated file: {output_path}")

    # Optionally create a zip containing the output file
    if create_zip:
        zip_path = output_path.with_suffix(output_path.suffix + ".zip")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(output_path, arcname=output_path.name)
        if verbose:
            print(f"✅ Created zip: {zip_path}")
        return zip_path

    return output_path


# -------------------------
# CLI entrypoint
# -------------------------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Collect contents of files into a single aggregated file."
    )
    p.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Root folder to scan (default: current directory)",
    )
    p.add_argument(
        "--output",
        "-o",
        default="all_files_content.txt",
        help="Output filename to create inside root (default: all_files_content.txt)",
    )
    p.add_argument(
        "--ignore-folder",
        "-F",
        action="append",
        default=[],
        help="Folder name or relative folder path to ignore (can be repeated). Example: --ignore-folder node_modules",
    )
    p.add_argument(
        "--ignore-file",
        "-f",
        action="append",
        default=[],
        help="File name or relative file path to ignore (can be repeated). Example: --ignore-file .env",
    )
    p.add_argument(
        "--ignore-glob",
        "-g",
        action="append",
        default=[],
        help="Glob pattern (applied to relative file path). Example: --ignore-glob '*.pyc'",
    )
    p.add_argument(
        "--only-ext",
        "-e",
        action="append",
        default=[],
        help="Only include these file extensions (example: --only-ext .py --only-ext .xml). If omitted, include all.",
    )
    p.add_argument(
        "--zip",
        action="store_true",
        help="Create a zip file containing the generated output file.",
    )
    p.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Verbose output (show skipped items).",
    )
    return p


def main():
    parser = build_arg_parser()
    args = parser.parse_args()

    # Merge defaults with CLI-specified ignores
    ignore_folders = list(
        dict.fromkeys(DEFAULT_IGNORE_FOLDERS + (args.ignore_folder or []))
    )
    ignore_files = list(dict.fromkeys(DEFAULT_IGNORE_FILES + (args.ignore_file or [])))
    ignore_globs = list(dict.fromkeys(DEFAULT_IGNORE_GLOBS + (args.ignore_glob or [])))

    # Normalize extension flags
    only_ext = args.only_ext or []
    only_ext_normalized = []
    for ext in only_ext:
        if not ext:
            continue
        if not ext.startswith("."):
            ext = "." + ext
        only_ext_normalized.append(ext.lower())

    # Run
    result_path = collect_files_content(
        root_folder=args.root,
        output_filename=args.output,
        ignore_folders=ignore_folders,
        ignore_files=ignore_files,
        ignore_globs=ignore_globs,
        include_extensions=only_ext_normalized if only_ext_normalized else None,
        create_zip=args.zip,
        verbose=args.verbose,
    )

    print()
    print("Done.")
    print("Result:", result_path)


if __name__ == "__main__":
    main()
