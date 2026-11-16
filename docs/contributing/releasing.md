<!-- Estate file; not part of Terax. -->
# Releasing by hand

How to publish Intel Mac, Apple Silicon and Windows builds that installed copies of Estate can update to. `release.yml` still builds every platform and expects signing secrets the repository doesn't have, so until that's sorted, releases are built locally and uploaded with `gh`.

## What the updater needs

Estate checks for updates only when you click **Check for updates** in Settings → About. It reads `latest.json` from the release GitHub marks as latest (`releases/latest/download/latest.json`), so the release must:

- have a higher version than the installed app;
- be signed with the updater key whose public half is in `src-tauri/tauri.conf.json` (key ID `1B030B03EAEAC126`);
- carry `latest.json` and the update archive it points to;
- be a normal release, not a pre-release or a draft (those never count as latest);
- use a tag that doesn't start with `v`, or `release.yml` runs on it.

## Steps

1. **Bump the version** in `package.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`:
   ```bash
   pnpm release:bump 0.1.1
   ```
   Commit and push the change (and anything else going into the release).

2. **Build** each platform, with the signing key set in the same terminal. Both Mac builds can run on one Mac, Intel or Apple Silicon (`rust-toolchain.toml` installs both targets):
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/estate.key)"
   printf 'Key password: '; stty -echo; IFS= read -r TAURI_SIGNING_PRIVATE_KEY_PASSWORD; stty echo; echo
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   export MACOSX_DEPLOYMENT_TARGET=12.0
   pnpm tauri build --target x86_64-apple-darwin
   pnpm tauri build --target aarch64-apple-darwin
   ```
   The bundled `estate-cli` follows `--target` on its own. On the Windows PC, in PowerShell, from the same commit, with a copy of the key at `~\.tauri\estate.key`:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $HOME\.tauri\estate.key
   $pw = Read-Host 'Key password' -AsSecureString
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new('', $pw).Password
   pnpm tauri build
   ```

3. **Write the update manifest**, naming the tag you'll publish. On the Windows PC first:
   ```powershell
   pnpm release:updater --tag estate-0.1.1
   ```
   Copy its `src-tauri\target\updater\` folder (the installers and `latest.json`) to the Mac, then on the Mac:
   ```bash
   pnpm release:updater --tag estate-0.1.1 --notes "What's new in 0.1.1" --merge <windows folder>/latest.json
   ```
   It picks up every platform built on the machine, refuses an artifact signed with another key or built before the bump, merges the Windows platforms, and says which platforms are still missing. Output goes to `src-tauri/target/updater/`. Skip `--merge` for a Mac-only release; Windows users then simply aren't offered it.

   | Platform | Updater key | Uploaded file |
   | --- | --- | --- |
   | Intel Mac | `darwin-x86_64` | `Estate_<v>_x64.app.tar.gz` (testers get `Estate_<v>_x64.dmg`) |
   | Apple Silicon Mac | `darwin-aarch64` | `Estate_<v>_aarch64.app.tar.gz` (testers get `Estate_<v>_aarch64.dmg`) |
   | Windows | `windows-x86_64`, `windows-x86_64-nsis` | `Estate_<v>_x64-setup.exe` |
   | Windows MSI | `windows-x86_64-msi` | `Estate_<v>_x64_en-US.msi` |

4. **Publish** with the printed command, filling in the commit you built from (`git rev-parse HEAD`) and a notes file, and adding the Windows installers from the copied folder. Don't pass `--prerelease`.

5. **Test the update** from an installed older build on each platform: Settings → About → Check for updates, then Install. Estate restarts on the new version.

## Keep the key safe

The private key (`~/.tauri/estate.key`) and its password belong in a password manager. If they're lost, installed copies can never verify another update; if they leak, someone else could sign one.
