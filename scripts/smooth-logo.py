#!/usr/bin/env python3
"""Convert the auto-traced Sonata logo outlines into smooth Bezier curves.

The Figma export is a bitmap trace: every contour is a polyline of ~123 straight
segments quantised to a ~0.75-unit grid, so the serif curves are visibly faceted
and carry single-unit staircase spurs. This rebuilds each contour as cubic
Beziers:

  1. Ramer-Douglas-Peucker drops the quantisation noise and the stray spurs.
  2. Corner detection keeps genuine sharp vertices (serif terminals, the points
     of the sparkle) from being rounded away.
  3. Schneider least-squares fitting replaces each smooth run between corners
     with as few cubic segments as meet the error tolerance.

Usage: smooth-logo.py <in.svg> <out.svg> [--rdp F] [--error F] [--corner DEG]
"""
from __future__ import annotations

import math
import re
import sys

Point = tuple[float, float]

# ---------------------------------------------------------------- vector math

def sub(a: Point, b: Point) -> Point:
    return (a[0] - b[0], a[1] - b[1])


def add(a: Point, b: Point) -> Point:
    return (a[0] + b[0], a[1] + b[1])


def mul(a: Point, s: float) -> Point:
    return (a[0] * s, a[1] * s)


def dot(a: Point, b: Point) -> float:
    return a[0] * b[0] + a[1] * b[1]


def norm(a: Point) -> float:
    return math.hypot(a[0], a[1])


def unit(a: Point) -> Point:
    n = norm(a)
    return (0.0, 0.0) if n == 0 else (a[0] / n, a[1] / n)


# ------------------------------------------------------------- path d parsing

TOKEN = re.compile(r"[MmLlHhVvZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?")


def parse_path(d: str) -> list[list[Point]]:
    """Parse a polyline-only path (M/L/H/V/Z) into closed contours."""
    tokens = TOKEN.findall(d)
    contours: list[list[Point]] = []
    cur: list[Point] = []
    x = y = 0.0
    start: Point = (0.0, 0.0)
    cmd = ""
    i = 0

    def num() -> float:
        nonlocal i
        v = float(tokens[i])
        i += 1
        return v

    while i < len(tokens):
        t = tokens[i]
        if t.lstrip("-").replace(".", "", 1).replace("e", "", 1) == "" or t in "MmLlHhVvZz":
            if t in "MmLlHhVvZz":
                cmd = t
                i += 1
                if cmd in "Zz":
                    if len(cur) > 2:
                        contours.append(cur)
                    cur = []
                    x, y = start
                    continue
            # fall through to read operands for the current command
        if cmd in "Mm":
            nx, ny = num(), num()
            x, y = (nx, ny) if cmd == "M" else (x + nx, y + ny)
            if len(cur) > 2:
                contours.append(cur)
            cur = [(x, y)]
            start = (x, y)
            cmd = "L" if cmd == "M" else "l"  # implicit lineto for extra pairs
        elif cmd in "Ll":
            nx, ny = num(), num()
            x, y = (nx, ny) if cmd == "L" else (x + nx, y + ny)
            cur.append((x, y))
        elif cmd in "Hh":
            nx = num()
            x = nx if cmd == "H" else x + nx
            cur.append((x, y))
        elif cmd in "Vv":
            ny = num()
            y = ny if cmd == "V" else y + ny
            cur.append((x, y))
        else:
            raise ValueError(f"unsupported command {cmd!r} (curves already present?)")

    if len(cur) > 2:
        contours.append(cur)
    return contours


# ----------------------------------------------------------------- simplifying

def dedupe(pts: list[Point], eps: float = 1e-9) -> list[Point]:
    out = [pts[0]]
    for p in pts[1:]:
        if norm(sub(p, out[-1])) > eps:
            out.append(p)
    if len(out) > 1 and norm(sub(out[0], out[-1])) <= eps:
        out.pop()
    return out


def rdp(pts: list[Point], eps: float) -> list[Point]:
    """Ramer-Douglas-Peucker on an open run."""
    if len(pts) < 3:
        return pts[:]
    a, b = pts[0], pts[-1]
    ab = sub(b, a)
    length = norm(ab)
    worst = 0.0
    idx = 0
    for k in range(1, len(pts) - 1):
        if length == 0:
            dist = norm(sub(pts[k], a))
        else:
            dist = abs(ab[0] * (a[1] - pts[k][1]) - (a[0] - pts[k][0]) * ab[1]) / length
        if dist > worst:
            worst, idx = dist, k
    if worst <= eps:
        return [a, b]
    return rdp(pts[: idx + 1], eps)[:-1] + rdp(pts[idx:], eps)


def rdp_closed(pts: list[Point], eps: float) -> list[Point]:
    """RDP on a closed contour, anchored at its two extreme points so the
    simplification does not depend on where the contour happens to start."""
    n = len(pts)
    if n < 4:
        return pts[:]
    start = min(range(n), key=lambda k: (pts[k][1], pts[k][0]))
    rot = pts[start:] + pts[:start]
    far = max(range(n), key=lambda k: norm(sub(rot[k], rot[0])))
    head = rdp(rot[: far + 1], eps)
    tail = rdp(rot[far:] + [rot[0]], eps)
    return head[:-1] + tail[:-1]


def corner_flags(pts: list[Point], angle_deg: float) -> list[bool]:
    """True where the contour turns hard enough to be a real corner."""
    n = len(pts)
    limit = math.radians(angle_deg)
    flags = []
    for k in range(n):
        prev_v = unit(sub(pts[k], pts[(k - 1) % n]))
        next_v = unit(sub(pts[(k + 1) % n], pts[k]))
        if prev_v == (0.0, 0.0) or next_v == (0.0, 0.0):
            flags.append(True)
            continue
        turn = math.acos(max(-1.0, min(1.0, dot(prev_v, next_v))))
        flags.append(turn > limit)
    return flags


# ------------------------------------------------- Schneider curve fitting

def chord_params(pts: list[Point]) -> list[float]:
    u = [0.0]
    for k in range(1, len(pts)):
        u.append(u[-1] + norm(sub(pts[k], pts[k - 1])))
    total = u[-1]
    return [v / total for v in u] if total else [0.0] * len(pts)


def bezier(ctrl: list[Point], t: float) -> Point:
    mt = 1 - t
    a = mt * mt * mt
    b = 3 * mt * mt * t
    c = 3 * mt * t * t
    d = t * t * t
    return (
        ctrl[0][0] * a + ctrl[1][0] * b + ctrl[2][0] * c + ctrl[3][0] * d,
        ctrl[0][1] * a + ctrl[1][1] * b + ctrl[2][1] * c + ctrl[3][1] * d,
    )


def fit_one(pts: list[Point], u: list[float], t1: Point, t2: Point) -> list[Point]:
    """Least-squares fit of a single cubic with fixed endpoint tangents."""
    p0, p3 = pts[0], pts[-1]
    c00 = c01 = c11 = x0 = x1 = 0.0
    for k, t in enumerate(u):
        mt = 1 - t
        b0 = mt * mt * mt
        b1 = 3 * mt * mt * t
        b2 = 3 * mt * t * t
        b3 = t * t * t
        a1 = mul(t1, b1)
        a2 = mul(t2, b2)
        c00 += dot(a1, a1)
        c01 += dot(a1, a2)
        c11 += dot(a2, a2)
        tmp = sub(pts[k], add(mul(p0, b0 + b1), mul(p3, b2 + b3)))
        x0 += dot(a1, tmp)
        x1 += dot(a2, tmp)
    det = c00 * c11 - c01 * c01
    seg = norm(sub(p3, p0))
    if abs(det) < 1e-12:
        alpha1 = alpha2 = seg / 3.0
    else:
        alpha1 = (x0 * c11 - x1 * c01) / det
        alpha2 = (c00 * x1 - c01 * x0) / det
    floor = seg * 1e-6
    if alpha1 < floor or alpha2 < floor:
        alpha1 = alpha2 = seg / 3.0
    return [p0, add(p0, mul(t1, alpha1)), add(p3, mul(t2, alpha2)), p3]


def max_error(pts: list[Point], u: list[float], ctrl: list[Point]) -> tuple[float, int]:
    worst = 0.0
    idx = len(pts) // 2
    for k in range(1, len(pts) - 1):
        d = norm(sub(bezier(ctrl, u[k]), pts[k]))
        if d > worst:
            worst, idx = d, k
    return worst, idx


def fit_run(pts: list[Point], t1: Point, t2: Point, error: float, depth: int = 0) -> list[list[Point]]:
    """Fit a run of points, splitting at the worst point when out of tolerance."""
    if len(pts) == 2:
        d = norm(sub(pts[1], pts[0])) / 3.0
        return [[pts[0], add(pts[0], mul(t1, d)), add(pts[1], mul(t2, d)), pts[1]]]
    u = chord_params(pts)
    ctrl = fit_one(pts, u, t1, t2)
    err, idx = max_error(pts, u, ctrl)
    if err <= error or depth >= 24:
        return [ctrl]
    if idx <= 0 or idx >= len(pts) - 1:
        idx = len(pts) // 2
    centre = unit(sub(pts[idx + 1], pts[idx - 1]))
    if centre == (0.0, 0.0):
        centre = unit(sub(pts[idx], pts[idx - 1]))
    left = fit_run(pts[: idx + 1], t1, mul(centre, -1), error, depth + 1)
    right = fit_run(pts[idx:], centre, t2, error, depth + 1)
    return left + right


def fit_contour(pts: list[Point], corners: list[bool], error: float) -> list[list[Point]]:
    n = len(pts)
    idxs = [k for k in range(n) if corners[k]]
    curves: list[list[Point]] = []

    if not idxs:  # fully smooth loop - cut it in two so tangents stay defined
        idxs = [0, n // 2]

    for a, b in zip(idxs, idxs[1:] + [idxs[0] + n]):
        run = [pts[k % n] for k in range(a, b + 1)]
        run = dedupe(run) if len(run) > 2 else run
        if len(run) < 2:
            continue
        t1 = unit(sub(run[1], run[0]))
        t2 = unit(sub(run[-2], run[-1]))
        if t1 == (0.0, 0.0) or t2 == (0.0, 0.0):
            continue
        curves.extend(fit_run(run, t1, t2, error))
    return curves


# ------------------------------------------------------------------- emitting

def fmt(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def emit(curves: list[list[Point]]) -> str:
    if not curves:
        return ""
    out = [f"M{fmt(curves[0][0][0])} {fmt(curves[0][0][1])}"]
    for c in curves:
        out.append(
            f"C{fmt(c[1][0])} {fmt(c[1][1])} {fmt(c[2][0])} {fmt(c[2][1])} {fmt(c[3][0])} {fmt(c[3][1])}"
        )
    out.append("Z")
    return "".join(out)


def smooth_d(d: str, rdp_eps: float, error: float, corner_deg: float) -> tuple[str, int, int]:
    pieces = []
    before = after = 0
    for contour in parse_path(d):
        pts = dedupe(contour)
        before += len(pts)
        pts = rdp_closed(pts, rdp_eps)
        if len(pts) < 3:
            continue
        curves = fit_contour(pts, corner_flags(pts, corner_deg), error)
        after += len(curves)
        pieces.append(emit(curves))
    return "".join(pieces), before, after


def main() -> int:
    args = [a for a in sys.argv[1:]]
    opts = {"--rdp": 1.0, "--error": 0.9, "--corner": 42.0}
    positional = []
    k = 0
    while k < len(args):
        if args[k] in opts:
            opts[args[k]] = float(args[k + 1])
            k += 2
        else:
            positional.append(args[k])
            k += 1
    if len(positional) != 2:
        print(__doc__)
        return 2

    src, dst = positional
    with open(src, encoding="utf-8") as fh:
        svg = fh.read()

    stats = []

    def repl(m: re.Match[str]) -> str:
        new_d, before, after = smooth_d(m.group(2), opts["--rdp"], opts["--error"], opts["--corner"])
        stats.append((before, after))
        return f'{m.group(1)}"{new_d}"'

    out = re.sub(r'(\sd=)"([^"]+)"', repl, svg)

    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(out)

    for n, (before, after) in enumerate(stats, 1):
        print(f"  path {n}: {before} line segments -> {after} cubic curves")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
