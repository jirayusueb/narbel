# narbel brand assets

Mark geometry lives in `src/shared/ui/brand.tsx` (viewBox 32, 5px pen stroke, 3.75 dot). `build-assets.mjs` and `og.html` repeat it; change all three together. Commands run from `apps/web`. Chrome stands in for any headless Chromium.

## logo.svg, logo-mark.svg, favicon.svg

Wordmark is Roboto Serif 400 converted to outlines with fontkit (not a dependency of the repo).

    mkdir -p /tmp/fk && (cd /tmp/fk && bun add fontkit) && bun brand/build-assets.mjs

## favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png

Rasterize `favicon.svg` in Chrome with a transparent background (ImageMagick's SVG renderer drops the stroke), then bundle 16/32/48 into the ico:

    for s in 16 32 48 180 192 512; do
      echo "<body style='margin:0'><img src='$PWD/public/favicon.svg' width=$s height=$s style='display:block'>" > /tmp/r$s.html
      chrome --headless=new --default-background-color=00000000 --force-device-scale-factor=1 --window-size=$s,$s --screenshot=/tmp/r$s.png file:///tmp/r$s.html
    done
    cp /tmp/r180.png public/apple-touch-icon.png; cp /tmp/r192.png public/icon-192.png; cp /tmp/r512.png public/icon-512.png
    magick /tmp/r16.png /tmp/r32.png /tmp/r48.png public/favicon.ico

## og-image.png (1200x630)

Authored in `og.html` with the real fonts. Serve the repo root so the font URLs resolve, then screenshot:

    (cd ../.. && python3 -m http.server 8765 &)
    chrome --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 --screenshot=public/og-image.png http://localhost:8765/apps/web/brand/og.html
    magick identify public/og-image.png

The font paths in `og.html` point at pinned `.bun` store directories; update them after a fontsource upgrade.

## site.webmanifest

Hand-written, no build step.

## og:image origin

`src/routes/__root.tsx` uses relative `/og-image.png` and `/` because `src/shared/config` has no public origin. Many crawlers need an absolute URL: add a public origin env and prefix both.
