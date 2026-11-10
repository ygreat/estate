<!-- Estate file; not part of Terax. -->
# Releasing a macOS build by hand

How to publish an Intel Mac build that installed copies of Estate can update to. `release.yml` still builds every platform and expects signing secrets the repository doesn't have, so until that's sorted, releases are built locally and uploaded with `gh`.

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

2. **Build**, with the signing key set in the same terminal:
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/estate.key)"
   printf 'Key password: '; stty -echo; IFS= read -r TAURI_SIGNING_PRIVATE_KEY_PASSWORD; stty echo; echo
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   pnpm tauri build --target x86_64-apple-darwin
   ```

3. **Write the update manifest**, naming the tag you'll publish:
   ```bash
   pnpm release:updater --tag estate-0.1.1 --notes "What's new in 0.1.1"
   ```
   It refuses an archive signed with another key, or one built before the bump, and prints the `gh release create` command to run next. Its output goes to `src-tauri/target/x86_64-apple-darwin/release/bundle/updater/`.

4. **Publish** with the printed command, filling in the commit you built from (`git rev-parse HEAD`) and a notes file. Don't pass `--prerelease`.

5. **Test the update** from an installed older build: Settings → About → Check for updates, then Install. Estate restarts on the new version.

## Keep the key safe

The private key (`~/.tauri/estate.key`) and its password belong in a password manager. If they're lost, installed copies can never verify another update; if they leak, someone else could sign one.
