#!/bin/sh
# Install the stable Delta application and its bundled CLI on macOS or Linux.
set -eu

mode=interactive
action=install
while [ "$#" -gt 0 ]; do
    case "$1" in
        --non-interactive) mode=non-interactive ;;
        --locate-cli) action=locate-cli ;;
        --help|-h)
            printf '%s\n' 'Usage: sh install.sh [--non-interactive] [--locate-cli]' \
                'Locate the stable CLI without installing (--locate-cli), or install it if absent.' \
                'Non-interactive installation prints only the absolute CLI path on stdout.'
            exit 0
            ;;
        *) echo "Unknown installer argument: $1" >&2; exit 2 ;;
    esac
    shift
done

os=$(uname -s)
case "$os" in
    Darwin) platform=macos ;;
    Linux) platform=linux ;;
    *) echo "Delta installer does not support $os." >&2; exit 1 ;;
esac
case "$(uname -m)" in
    arm64|aarch64) arch=aarch64 ;;
    x86_64|amd64) arch=x86_64 ;;
    *) echo "Unsupported CPU architecture." >&2; exit 1 ;;
esac

: "${HOME:?HOME is required}"
if [ "$platform" = macos ]; then
    app_dir="$HOME/Applications"
    app="$app_dir/Delta.app"
    cli="$app/Contents/MacOS/delta"
else
    app="$HOME/.local/delta.app"
    cli="$app/bin/delta"
fi
link="$HOME/.local/bin/delta"

report_cli() {
    if [ "$mode" = non-interactive ] || [ "$action" = locate-cli ]; then
        printf '%s\n' "$cli"
    else
        printf 'Delta CLI: %s\n' "$cli" >&2
        if [ ! -L "$link" ] || [ "$(readlink "$link")" != "$cli" ]; then
            printf '%s is occupied; use the CLI path above or resolve the conflict.\n' "$link" >&2
            return
        fi
        case ":$PATH:" in
            *":$HOME/.local/bin:"*) ;;
            *)
                case "${SHELL:-}" in
                    */zsh) profile="$HOME/.zshrc" ;;
                    */bash)
                        if [ "$platform" = macos ]; then
                            profile="$HOME/.bash_profile"
                        else
                            profile="$HOME/.bashrc"
                        fi
                        ;;
                    *) profile= ;;
                esac
                if [ -n "$profile" ]; then
                    printf 'Add %s to PATH in %s? [y/N] ' "$HOME/.local/bin" "$profile" >/dev/tty
                    IFS= read -r answer </dev/tty || answer=
                    case "$answer" in
                        y|Y|yes|YES)
                            printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$profile"
                            printf 'Updated %s. Open a new terminal to use delta.\n' "$profile" >&2
                            ;;
                        *) printf 'Add %s to PATH to use delta in your shell.\n' "$HOME/.local/bin" >&2 ;;
                    esac
                else
                    printf 'Add %s to PATH to use delta in your shell.\n' "$HOME/.local/bin" >&2
                fi
                ;;
        esac
    fi
}

# Prefer the link the user selected, then a stable app bundle already on disk.
found=
if [ -L "$link" ]; then
    existing=$(readlink "$link")
    case "$platform:$existing" in
        "macos:$HOME/Applications/Delta.app/Contents/MacOS/delta"|\
        macos:/Applications/Delta.app/Contents/MacOS/delta|\
        "linux:$HOME/.local/delta.app/bin/delta")
            if [ -x "$existing" ]; then found="$existing"; fi
            ;;
    esac
fi
if [ -z "$found" ] && [ "$platform" = macos ]; then
    for candidate in "$cli" /Applications/Delta.app/Contents/MacOS/delta; do
        if [ -x "$candidate" ]; then found="$candidate"; break; fi
    done
elif [ -z "$found" ] && [ -x "$cli" ]; then
    found="$cli"
fi
if [ -n "$found" ]; then
    cli="$found"
    if [ "$action" = install ] && [ ! -e "$link" ] && [ ! -L "$link" ]; then
        mkdir -p "$HOME/.local/bin"
        ln -s "$cli" "$link"
    fi
    report_cli
    exit 0
fi
if [ "$action" = locate-cli ]; then exit 1; fi

if [ "$mode" = interactive ]; then
    if [ ! -r /dev/tty ]; then
        echo "No terminal available; use --non-interactive to install without a prompt." >&2
        exit 1
    fi
    printf '%s\n' 'Delta includes a GUI app and a CLI that can start its headless background process.' \
        "Install Delta for this user? [y/N] " >/dev/tty
    IFS= read -r answer </dev/tty || exit 1
    case "$answer" in y|Y|yes|YES) ;; *) echo "Installation cancelled." >&2; exit 1 ;; esac
fi

work=$(mktemp -d)
cleanup() {
    if [ -n "${staged:-}" ] && [ -d "$staged" ]; then
        if [ -d "$staged/old.app" ] && [ ! -e "$app" ]; then
            mv "$staged/old.app" "$app"
        fi
        rm -rf "$staged"
    fi
    rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
response="$work/release.json"
asset_url="https://delta.dev/api/releases/stable/latest/asset?asset=delta&os=$platform&arch=$arch"
curl -fsSL "$asset_url" -o "$response"
if [ "$platform" = macos ]; then
    download_url=$(plutil -extract url raw -o - "$response")
else
    download_url=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["url"])' "$response")
fi
case "$download_url" in
    https://*) ;;
    *) echo "The release endpoint returned an invalid download URL." >&2; exit 1 ;;
esac

if [ "$platform" = macos ]; then
    archive="$work/Delta.app.zip"
else
    archive="$work/Delta.tar.gz"
fi
if [ -e "$link" ] || [ -L "$link" ]; then
    if [ ! -L "$link" ]; then
        echo "Unrelated command exists at $link; leaving it untouched." >&2
        exit 1
    fi
    existing=$(readlink "$link")
    case "$existing" in
        "$cli"|"$HOME/Applications/Delta.app/Contents/MacOS/delta"|\
        /Applications/Delta.app/Contents/MacOS/delta|\
        "$HOME/.local/delta.app/bin/delta")
            ;;
        *)
            echo "Unrelated CLI link exists at $link; leaving it untouched." >&2
            exit 1
            ;;
    esac
fi

curl -fsSL "$download_url" -o "$archive"
if [ "$platform" = macos ]; then
    mkdir -p "$app_dir" "$HOME/.local/bin"
    staged=$(mktemp -d "$app_dir/.delta-install.XXXXXX")
    ditto -x -k "$archive" "$staged"
    if [ ! -x "$staged/Delta.app/Contents/MacOS/delta" ]; then
        echo "The Delta archive is missing its CLI." >&2
        exit 1
    fi
    # Keep the old bundle available until the new one is in place.
    if [ -e "$app" ]; then
        mv "$app" "$staged/old.app"
    fi
    if ! mv "$staged/Delta.app" "$app"; then
        if [ -e "$staged/old.app" ]; then mv "$staged/old.app" "$app"; fi
        exit 1
    fi
    ln -sfn "$cli" "$link"
    rm -rf "$staged"
    staged=
else
    tar -xzf "$archive" -C "$work"
    if [ ! -f "$work/Delta/install.sh" ]; then
        echo "The Delta archive is missing its installer." >&2
        exit 1
    fi
    bash "$work/Delta/install.sh" >&2
    if [ ! -x "$cli" ] || [ ! -L "$link" ] || [ "$(readlink "$link")" != "$cli" ]; then
        echo "Delta installed, but its CLI could not be linked." >&2
        exit 1
    fi
fi

report_cli
