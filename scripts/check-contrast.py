#!/usr/bin/env python3
"""Verify the design-language text and boundary tokens in globals.css."""

from pathlib import Path
import re
import sys


CSS_PATH = Path(__file__).resolve().parents[1] / "src/app/globals.css"
TEXT_TOKENS = (
    "ink",
    "ink-soft",
    "ink-mute",
    "grove",
    "grove-deep",
    "gold",
    "violet",
    "warn",
    "danger",
)
BOUNDARY_TOKENS = ("boundary", "focus")
BACKGROUNDS = ("paper", "paper-raised")
COMPONENT_PAIRS = (
    ("button-primary-text", "grove", 4.5, "primary button"),
    ("button-primary-text", "grove-deep", 4.5, "primary button hover"),
)


def h2r(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def lum(rgb: tuple[int, int, int]) -> float:
    def channel(value: int) -> float:
        normalized = value / 255
        return (
            normalized / 12.92
            if normalized <= 0.03928
            else ((normalized + 0.055) / 1.055) ** 2.4
        )

    red, green, blue = (channel(value) for value in rgb)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def ratio(first: str, second: str) -> float:
    first_lum, second_lum = lum(h2r(first)), lum(h2r(second))
    high, low = max(first_lum, second_lum), min(first_lum, second_lum)
    return (high + 0.05) / (low + 0.05)


def block_after(css: str, marker: str) -> str:
    start = css.index(marker) + len(marker)
    brace = css.index("{", start)
    depth = 1
    for index in range(brace + 1, len(css)):
        if css[index] == "{":
            depth += 1
        elif css[index] == "}":
            depth -= 1
            if depth == 0:
                return css[brace + 1 : index]
    raise ValueError(f"Unclosed CSS block after {marker}")


def tokens(block: str) -> dict[str, str]:
    return dict(
        re.findall(r"--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;", block)
    )


def main() -> int:
    css = CSS_PATH.read_text(encoding="utf-8")
    light = tokens(block_after(css, ":root"))
    dark_media = block_after(css, "@media (prefers-color-scheme: dark)")
    dark = {**light, **tokens(block_after(dark_media, ':root:not([data-theme="light"])'))}
    failures: list[str] = []

    for scheme, palette in (("light", light), ("dark", dark)):
        for role, required in (
            *((token, 4.5) for token in TEXT_TOKENS),
            *((token, 3.0) for token in BOUNDARY_TOKENS),
        ):
            if role not in palette:
                failures.append(f"{scheme}: missing --{role}")
                continue
            for background in BACKGROUNDS:
                if background not in palette:
                    failures.append(f"{scheme}: missing --{background}")
                    continue
                measured = ratio(palette[role], palette[background])
                verdict = "PASS" if measured >= required else "FAIL"
                print(
                    f"{verdict} {scheme:5} --{role} on --{background}: "
                    f"{measured:.2f}:1 (needs {required:.1f}:1)"
                )
                if measured < required:
                    failures.append(
                        f"{scheme}: --{role} on --{background} is "
                        f"{measured:.2f}:1, below {required:.1f}:1"
                    )

        for foreground, background, required, label in COMPONENT_PAIRS:
            if foreground not in palette or background not in palette:
                failures.append(
                    f"{scheme}: missing component token for {label} "
                    f"(--{foreground} on --{background})"
                )
                continue
            measured = ratio(palette[foreground], palette[background])
            verdict = "PASS" if measured >= required else "FAIL"
            print(
                f"{verdict} {scheme:5} {label}: --{foreground} on "
                f"--{background}: {measured:.2f}:1 (needs {required:.1f}:1)"
            )
            if measured < required:
                failures.append(
                    f"{scheme}: {label} --{foreground} on --{background} is "
                    f"{measured:.2f}:1, below {required:.1f}:1"
                )

    if failures:
        print("\nContrast check failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print("\nContrast check passed for both schemes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
