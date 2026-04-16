#!/usr/bin/env bash
# scripts/generate-icons.sh
#
# Gera os três formatos de ícone do app a partir de electron/assets/icon.svg:
#   icon.png  — 512×512, usado no Linux (AppImage/deb/pacman)
#   icon.ico  — multi-tamanho (16/32/48/256), usado no Windows (NSIS)
#   icon.icns — multi-resolução, usado no macOS (dmg)
#
# Dependências:
#   rsvg-convert  →  sudo pacman -S librsvg          (preferido para SVG→PNG)
#   OU inkscape   →  sudo pacman -S inkscape
#
#   convert       →  sudo pacman -S imagemagick       (para .ico)
#
#   png2icns      →  sudo pacman -S libicns            (para .icns no Linux)
#   OU iconutil   →  nativo no macOS (sem instalação)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS="$SCRIPT_DIR/../electron/assets"
SVG="$ASSETS/icon.svg"

if [ ! -f "$SVG" ]; then
  echo "ERRO: $SVG não encontrado."
  exit 1
fi

# ── Helper: SVG → PNG num tamanho específico ──────────────────────────────────
svg_to_png() {
  local size="$1" out="$2"
  if command -v rsvg-convert &>/dev/null; then
    rsvg-convert -w "$size" -h "$size" "$SVG" -o "$out"
  elif command -v inkscape &>/dev/null; then
    inkscape --export-type=png \
             --export-width="$size" --export-height="$size" \
             --export-filename="$out" "$SVG" 2>/dev/null
  else
    echo "ERRO: Instale rsvg-convert (librsvg) ou inkscape."
    echo "  Manjaro/Arch: sudo pacman -S librsvg"
    exit 1
  fi
}

# ── 1. PNG 512×512 — Linux ────────────────────────────────────────────────────
echo "→ Gerando icon.png (512×512)..."
svg_to_png 512 "$ASSETS/icon.png"
echo "  OK: $ASSETS/icon.png"

# ── 2. ICO — Windows (16, 32, 48, 256) ───────────────────────────────────────
# ImageMagick v7 usa "magick"; v6 usa "convert"
if command -v magick &>/dev/null; then
  IM_CMD="magick"
elif command -v convert &>/dev/null; then
  IM_CMD="convert"
else
  IM_CMD=""
fi

if [ -n "$IM_CMD" ]; then
  echo "→ Gerando icon.ico (Windows)..."
  TMP=$(mktemp -d)
  for size in 16 32 48 256; do
    svg_to_png "$size" "$TMP/icon_${size}.png"
  done
  $IM_CMD "$TMP/icon_16.png" "$TMP/icon_32.png" "$TMP/icon_48.png" "$TMP/icon_256.png" \
    -compress zip "$ASSETS/icon.ico"
  rm -rf "$TMP"
  echo "  OK: $ASSETS/icon.ico"
else
  echo "  AVISO: ImageMagick não encontrado — icon.ico não gerado."
  echo "  Manjaro/Arch: sudo pacman -S imagemagick"
fi

# ── 3. ICNS — macOS ───────────────────────────────────────────────────────────
echo "→ Gerando icon.icns (macOS)..."
TMP=$(mktemp -d)
for size in 16 32 64 128 256 512 1024; do
  svg_to_png "$size" "$TMP/icon_${size}.png"
done

if command -v iconutil &>/dev/null; then
  # macOS: iconutil é nativo
  ICONSET="$TMP/icon.iconset"
  mkdir "$ICONSET"
  cp "$TMP/icon_16.png"   "$ICONSET/icon_16x16.png"
  cp "$TMP/icon_32.png"   "$ICONSET/icon_16x16@2x.png"
  cp "$TMP/icon_32.png"   "$ICONSET/icon_32x32.png"
  cp "$TMP/icon_64.png"   "$ICONSET/icon_32x32@2x.png"
  cp "$TMP/icon_128.png"  "$ICONSET/icon_128x128.png"
  cp "$TMP/icon_256.png"  "$ICONSET/icon_128x128@2x.png"
  cp "$TMP/icon_256.png"  "$ICONSET/icon_256x256.png"
  cp "$TMP/icon_512.png"  "$ICONSET/icon_256x256@2x.png"
  cp "$TMP/icon_512.png"  "$ICONSET/icon_512x512.png"
  cp "$TMP/icon_1024.png" "$ICONSET/icon_512x512@2x.png"
  iconutil -c icns "$ICONSET" -o "$ASSETS/icon.icns"
  echo "  OK: $ASSETS/icon.icns  (via iconutil)"
elif command -v png2icns &>/dev/null; then
  # Linux: png2icns do pacote icnsutils
  png2icns "$ASSETS/icon.icns" \
    "$TMP/icon_16.png" "$TMP/icon_32.png" \
    "$TMP/icon_128.png" "$TMP/icon_256.png" "$TMP/icon_512.png"
  echo "  OK: $ASSETS/icon.icns  (via png2icns)"
else
  echo "  AVISO: Nenhuma ferramenta ICNS encontrada — icon.icns não gerado."
  echo "  Linux:  sudo pacman -S libicns      (fornece png2icns)"
  echo "  macOS:  iconutil já está disponível nativamente"
  echo "  Nota:   o build macOS no CI (macos-latest) gera o .icns automaticamente"
  echo "          via electron-builder se icon.png estiver presente."
fi

rm -rf "$TMP"

echo ""
echo "Concluído. Ícones em electron/assets/:"
ls -lh "$ASSETS/"icon.* 2>/dev/null || true
