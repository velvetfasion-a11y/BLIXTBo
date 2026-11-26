"""Build the support assistant's knowledge from the repo's public copy.

The page text is extracted when the repo is present, so a copy change is picked up
without editing this module. support_facts.md is the maintained extra file.
A generated snapshot is written beside this module for the API image, which does
not contain the Next.js app.
"""

import os
import re
from pathlib import Path

SOURCE_FILES = (
    "lib/billing.ts",
    "lib/company.ts",
    "lib/account.ts",
    "components/privacy.tsx",
    "components/terms.tsx",
    "components/seller.tsx",
    "components/help.tsx",
    "components/settings.tsx",
    "components/profile.tsx",
    "components/faq-list.tsx",
    "lib/seo.ts",
    "components/landing.tsx",
    "components/connections.tsx",
    "components/subscription.tsx",
    "components/subscription-manage.tsx",
    "components/paywall.tsx",
    "components/confirm-apply.tsx",
    "app/hjalp/page.tsx",
    "app/villkor/page.tsx",
    "app/integritet/page.tsx",
)

_TEXT_NODE = re.compile(r">([^<>{}]{8,4000})<")
_EXPR = re.compile(r"\$\{[^{}]*\}")
_PRICE = re.compile(r"DEFAULT_PREMIUM_KR\s*=\s*(\d+)")
_DAYS = re.compile(r"DEFAULT_TRIAL_DAYS\s*=\s*(\d+)")
_FREE = re.compile(r"DEFAULT_FREE_AUTO_APPLIES\s*=\s*(\d+)")

_cache: dict[str, str] = {"key": "", "text": ""}


def repo_root() -> Path | None:
    candidates: list[Path] = []
    env = os.environ.get("BLIXTBO_REPO", "").strip()
    if env:
        candidates.append(Path(env))
    here = Path(__file__).resolve()
    candidates.extend(here.parents)
    for candidate in candidates:
        if (candidate / "components" / "help.tsx").is_file() and (candidate / "lib" / "billing.ts").is_file():
            return candidate
    return None


def generated_path() -> Path:
    return Path(__file__).resolve().with_name("generated_support_knowledge.txt")


def facts_path() -> Path:
    return Path(__file__).resolve().with_name("support_facts.md")


def _clean(value: str) -> str:
    text = _EXPR.sub(" ", value)
    text = text.replace("\\n", " ").replace("\\'", "'").replace('\\"', '"')
    return " ".join(text.split())


def _useful(text: str) -> bool:
    if len(text) < 18 or " " not in text:
        return False
    if text.startswith(("http://", "https://", "/", "@", ".", "#", "bg-", "text-", "mt-", "px-", "flex", "grid", "w-", "h-")):
        return False
    lowered = text.lower()
    if any(token in lowered for token in ("=>", "function ", "classname", "import ", "export ", "process.env", "worker_kek", "sk_live", "sk_test")):
        return False
    words = text.split()
    hyphenated = sum(1 for word in words if "-" in word)
    if words and hyphenated / len(words) > 0.45:
        return False
    letters = sum(character.isalpha() for character in text)
    return letters >= 12


def _price_lines(source: str) -> list[str]:
    price = _PRICE.search(source)
    days = _DAYS.search(source)
    free = _FREE.search(source)
    lines: list[str] = []
    if price and days:
        lines.append(f"Premium kostar {price.group(1)} kr per månad efter {days.group(1)} dagars provperiod.")
    if free:
        lines.append(f"Gratisversionen har ett tak på {free.group(1)} automatiska ansökningar. Premium tar bort taket.")
    return lines


def _quoted(source: str) -> list[str]:
    found: list[str] = []
    index = 0
    length = len(source)
    while index < length:
        quote = source[index]
        if quote not in "'\"`":
            index += 1
            continue
        index += 1
        chars: list[str] = []
        while index < length:
            current = source[index]
            if current == "\\":
                if index + 1 < length:
                    chars.append(source[index + 1])
                    index += 2
                    continue
            if quote == "`" and current == "$" and index + 1 < length and source[index + 1] == "{":
                index += 2
                depth = 1
                while index < length and depth:
                    if source[index] == "{":
                        depth += 1
                    elif source[index] == "}":
                        depth -= 1
                    index += 1
                chars.append(" ")
                continue
            if current == quote:
                break
            chars.append(current)
            index += 1
        found.append("".join(chars))
        index += 1
    return found


def extract_copy(source: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        text = _clean(raw)
        if not _useful(text) or text in seen:
            return
        seen.add(text)
        found.append(text)

    for item in _quoted(source):
        add(item)
    for match in _TEXT_NODE.finditer(source):
        add(match.group(1))
    for line in _price_lines(source):
        add(line)
    return found


def build_corpus(root: Path | None = None) -> str:
    root = root or repo_root()
    parts: list[str] = []
    if root is not None:
        for relative in SOURCE_FILES:
            path = root / relative
            if not path.is_file():
                continue
            source = path.read_text(encoding="utf-8")
            lines = extract_copy(source)
            if not lines:
                continue
            parts.append(f"## {relative}\n" + "\n".join(lines))
    facts = ""
    fact_file = facts_path()
    if fact_file.is_file():
        facts = fact_file.read_text(encoding="utf-8").strip()
    corpus = "\n\n".join(parts).strip()
    if len(corpus) > 36000:
        corpus = corpus[:36000].rsplit("\n", 1)[0]
    if facts and corpus:
        return facts + "\n\n" + corpus
    return facts or corpus


def write_generated(text: str | None = None) -> Path:
    body = text if text is not None else build_corpus()
    path = generated_path()
    current = path.read_text(encoding="utf-8") if path.is_file() else None
    if current != body:
        path.write_text(body, encoding="utf-8")
    return path


def load_knowledge() -> str:
    root = repo_root()
    key = ""
    if root is not None:
        stamps = []
        for relative in SOURCE_FILES:
            path = root / relative
            if path.is_file():
                stamps.append(f"{relative}:{path.stat().st_mtime_ns}")
        fact_file = facts_path()
        if fact_file.is_file():
            stamps.append(f"facts:{fact_file.stat().st_mtime_ns}")
        key = "|".join(stamps)
    else:
        path = generated_path()
        key = f"generated:{path.stat().st_mtime_ns}" if path.is_file() else "empty"
    if _cache["key"] == key and _cache["text"]:
        return _cache["text"]
    if root is not None:
        text = build_corpus(root)
        write_generated(text)
    elif generated_path().is_file():
        text = generated_path().read_text(encoding="utf-8").strip()
    else:
        text = facts_path().read_text(encoding="utf-8").strip() if facts_path().is_file() else ""
    _cache["key"] = key
    _cache["text"] = text
    return text


def main() -> None:
    path = write_generated()
    print(path)


if __name__ == "__main__":
    main()
