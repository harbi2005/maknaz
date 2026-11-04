#!/usr/bin/env python3
"""MAKNAZ documentation validator (standard library only).

Checks:
  1. Relative Markdown links point to files that exist.
  2. Heading anchors (#...) exist in the target file (GitHub slug rules).
  3. Every docs/**/*.md links back to the docs index (except sources/).
  4. Mermaid blocks render with `mmdc` (skipped unless --mermaid and mmdc on PATH).
  5. No secrets (tokens, private keys, passwords) in tracked text files.
  6. No forbidden claims (AI features, guaranteed compatibility, real payments) outside
     sentences that explicitly negate them.

Usage:  python3 tools/scripts/validate_docs.py [--mermaid]
Exit code 0 = all checks passed, 1 = at least one error.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP_DIRS = {".git", "node_modules", ".venv", "out", "cache", "__pycache__"}
TEXT_EXT = {".md", ".py", ".yml", ".yaml", ".json", ".css", ".csv", ".txt", ".example", ".toml", ".cfg"}

LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
FENCE_RE = re.compile(r"^(```|~~~)")

SECRET_PATTERNS = [
    ("GitHub token", re.compile(r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b")),
    ("GitHub fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}\b")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b")),
    ("Generic API key", re.compile(r"\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b")),
    ("Assigned password", re.compile(r"(?i)\b(?:password|passwd|secret|api_key|token)\s*[:=]\s*['\"][^'\"\s]{8,}['\"]")),
]

# Claims the project must never make. A line is accepted if it also contains a negation word.
CLAIM_PATTERNS = [
    ("AI feature claim", re.compile(r"(?i)\b(AI-powered|machine learning|artificial intelligence)\b|بالذكاء الاصطناعي|يعتمد على الذكاء")),
    ("Compatibility guarantee", re.compile(r"(?i)\bguaranteed compatib|صالحة للاستخدام الصناعي مضمون|نضمن صلاحية")),
    ("Real payment claim", re.compile(r"(?i)\breal payments? (?:processed|enabled)\b|دفع حقيقي مفعل")),
]
NEGATIONS = re.compile(r"(?i)\b(no|not|never|without|excluded|out of scope)\b|لا |لن |ليس|ليست|دون|بدون|ممنوع|خارج|أُلغيت|ألغيت|لا تدّعِ|غير")


def iter_files(exts=None):
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if exts is None or p.suffix in exts or fn in {".gitignore", ".env.example", "CODEOWNERS"}:
                yield p


def github_slug(text):
    """Approximate GitHub's heading anchor algorithm."""
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)   # links -> text
    text = text.replace("`", "").strip().lower()
    out = []
    for ch in text:
        cat = unicodedata.category(ch)
        if ch in " -":
            out.append("-" if ch == " " else ch)
        elif ch == "_" or cat[0] in ("L", "N") or cat in ("Mn", "Mc"):
            out.append(ch)
    return "".join(out)


def anchors_of(path, cache={}):
    if path in cache:
        return cache[path]
    seen, anchors, in_fence = {}, set(), False
    for line in path.read_text(encoding="utf-8").splitlines():
        if FENCE_RE.match(line.strip()):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = HEADING_RE.match(line)
        if m:
            base = github_slug(m.group(2))
            n = seen.get(base, 0)
            anchors.add(base if n == 0 else f"{base}-{n}")
            seen[base] = n + 1
    for m in re.finditer(r'<a\s+(?:id|name)="([^"]+)"', path.read_text(encoding="utf-8")):
        anchors.add(m.group(1))
    cache[path] = anchors
    return anchors


def strip_code(text):
    text = re.sub(r"(?ms)^(```|~~~).*?^\1", "", text)
    return re.sub(r"`[^`\n]*`", "", text)


def check_links(errors):
    count = 0
    for md in iter_files({".md"}):
        rel = md.relative_to(ROOT)
        if rel.parts[:2] == ("docs", "sources") and md.name != "README.md":
            continue
        text = strip_code(md.read_text(encoding="utf-8"))
        for m in LINK_RE.finditer(text):
            target = m.group(1)
            if re.match(r"^[a-z]+:", target) or target.startswith("mailto:"):
                continue
            count += 1
            path_part, _, frag = target.partition("#")
            dest = md if not path_part else (md.parent / path_part).resolve()
            if not dest.exists():
                errors.append(f"{rel}: broken link -> {target}")
                continue
            if frag and dest.is_file() and dest.suffix == ".md":
                from urllib.parse import unquote
                if unquote(frag) not in anchors_of(dest):
                    errors.append(f"{rel}: missing anchor -> {target}")
    return count


def check_index_backlinks(errors):
    for md in (ROOT / "docs").rglob("*.md"):
        rel = md.relative_to(ROOT)
        if "sources" in rel.parts and md.name != "README.md":
            continue
        if md == ROOT / "docs" / "README.md":
            continue
        head = "\n".join(md.read_text(encoding="utf-8").splitlines()[:6])
        if "README.md)" not in head:
            errors.append(f"{rel}: no link back to the docs index in the first lines")


def check_mermaid(errors, enabled):
    blocks = []
    for md in iter_files({".md"}):
        for i, m in enumerate(re.finditer(r"```mermaid\n(.*?)```", md.read_text(encoding="utf-8"), re.S)):
            blocks.append((md.relative_to(ROOT), i, m.group(1)))
    if not enabled:
        return len(blocks), "skipped (use --mermaid)"
    mmdc = shutil.which("mmdc")
    if not mmdc:
        return len(blocks), "skipped (mmdc not found)"
    with tempfile.TemporaryDirectory() as td:
        for rel, i, src in blocks:
            inp, outp = Path(td) / "d.mmd", Path(td) / "d.svg"
            inp.write_text(src, encoding="utf-8")
            r = subprocess.run([mmdc, "-i", str(inp), "-o", str(outp), "-q"], capture_output=True, text=True)
            if r.returncode != 0 or not outp.exists():
                errors.append(f"{rel}: mermaid block #{i + 1} failed: {(r.stderr or r.stdout).strip()[:200]}")
            outp.unlink(missing_ok=True)
    return len(blocks), "rendered"


def check_secrets(errors):
    for p in iter_files(TEXT_EXT):
        if p.resolve() == Path(__file__).resolve():
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for name, rx in SECRET_PATTERNS:
            for m in rx.finditer(text):
                line = text[: m.start()].count("\n") + 1
                errors.append(f"{p.relative_to(ROOT)}:{line}: possible secret ({name})")
    if (ROOT / ".env").exists():
        errors.append(".env exists in the working tree; make sure it is git-ignored and never committed")


def check_claims(errors):
    for md in iter_files({".md"}):
        rel = md.relative_to(ROOT)
        if "sources" in rel.parts:
            continue
        for n, line in enumerate(md.read_text(encoding="utf-8").splitlines(), 1):
            for name, rx in CLAIM_PATTERNS:
                if rx.search(line) and not NEGATIONS.search(line):
                    errors.append(f"{rel}:{n}: {name}: {line.strip()[:120]}")


def main():
    use_mermaid = "--mermaid" in sys.argv
    errors = []
    n_links = check_links(errors)
    check_index_backlinks(errors)
    n_mer, mer_state = check_mermaid(errors, use_mermaid)
    check_secrets(errors)
    check_claims(errors)
    print(f"links checked: {n_links}")
    print(f"mermaid blocks: {n_mer} ({mer_state})")
    if errors:
        print(f"\n{len(errors)} problem(s):")
        for e in errors:
            print("  -", e)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
