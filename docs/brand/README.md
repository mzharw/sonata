# Brand assets

The Sonata monogram comes from the [Sonata Brand System][figma] Figma file.

## Files

| Path | What it is |
| --- | --- |
| `logo-*.figma-export.svg` | Untouched Figma exports. Reference only — do not ship these. |
| `../../src/assets/logo-dark.svg` | Monogram on the dark green tile, for dark surfaces. |
| `../../src/assets/logo-light.svg` | Monogram on the cream tile, for light surfaces. |
| `../../src/assets/logo-mark.svg` | Monogram alone on transparency; the letter takes `currentColor`. |
| `../../src/components/Logo.tsx` | `Logo` (tile) and `LogoMark` (transparent) for the UI. |

Palette: green `#1E382D`, cream `#F4EFE3`, light ground `#F8F6F0`, gold `#C7924A`.

## Why the exports are not shipped directly

The Figma layer is a bitmap trace, not drawn geometry: each contour is ~120
straight segments on a ~0.75-unit grid, with single-unit staircase spurs along
the edges. That is invisible at 32px and obvious by 512px, so it would not
survive installer art or anything print.

`scripts/smooth-logo.py` rebuilds the contours as cubic Beziers — RDP to drop
the quantisation noise, corner detection so the serif terminals and the points
of the sparkle stay sharp, then Schneider least-squares fitting. It takes the
two paths from 117 and 23 line segments to 42 and 8 curves.

```sh
python3 scripts/smooth-logo.py docs/brand/logo-dark.figma-export.svg out.svg
```

If the Figma file ever gains a real vector master, prefer that over the trace
and retire this step.

## Regenerating the app icons

`src-tauri/icons/` is generated from the dark tile at 1024px. The mobile sets
Tauri also emits are deleted; this project ships desktop only.

```sh
magick -background none -density 3072 src/assets/logo-dark.svg -resize 1024x1024 /tmp/icon.png
npm run tauri icon /tmp/icon.png
rm -rf src-tauri/icons/android src-tauri/icons/ios
```

[figma]: https://www.figma.com/design/g1BBdyw6znNbSxe9AAwdNx/Sonata-Brand-System?node-id=4-8
