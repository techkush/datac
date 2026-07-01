#!/bin/sh
# Install the `datac` command system-wide.
# Copies the app into ~/.datac/app and drops a `datac` launcher on your PATH.
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/.datac/app"

echo "Installing datac…"

# 1) Check Node
if ! command -v node >/dev/null 2>&1; then
  echo "  ✗ Node.js is required but was not found. Install it from https://nodejs.org and retry."
  exit 1
fi

# 2) Copy the app
mkdir -p "$APP"
cp "$SRC/server.js" "$APP/server.js"
rm -rf "$APP/public" "$APP/bin" "$APP/assets"
cp -R "$SRC/public" "$APP/public"
cp -R "$SRC/bin" "$APP/bin"
[ -d "$SRC/assets" ] && cp -R "$SRC/assets" "$APP/assets"
chmod +x "$APP/bin/datac.js"
echo "  ✓ app installed to $APP"

# 3) Pick a bin dir on PATH and create the launcher
LAUNCHER_BODY="#!/bin/sh
exec node \"$APP/bin/datac.js\" \"\$@\"
"

install_launcher() {
  DIR="$1"
  if [ -d "$DIR" ] && [ -w "$DIR" ]; then
    printf '%s' "$LAUNCHER_BODY" > "$DIR/datac"
    chmod +x "$DIR/datac"
    echo "  ✓ command installed: $DIR/datac"
    return 0
  fi
  return 1
}

if install_launcher "/usr/local/bin"; then :
elif install_launcher "/opt/homebrew/bin"; then :
else
  mkdir -p "$HOME/.local/bin"
  printf '%s' "$LAUNCHER_BODY" > "$HOME/.local/bin/datac"
  chmod +x "$HOME/.local/bin/datac"
  echo "  ✓ command installed: $HOME/.local/bin/datac"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) echo "  ! Add this to your shell profile (~/.zshrc):"
       echo "      export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
fi

echo ""
echo "Done. Try it:"
echo "    cd ~/some-project"
echo "    datac init \"My Project\""
