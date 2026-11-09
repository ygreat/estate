<!-- Estate file; not part of Terax. -->
# Modifications

Estate is derived from Terax 0.9.0 (https://github.com/crynta/terax-ai, commit `a2c0877`, 6 November 2026), copyright 2026 Crynta, licensed under Apache-2.0. Every Terax file in this repository comes from that version; Estate does not take later Terax changes. Section 4(b) of the license requires modified files to carry a notice saying they were changed.

Files that can hold comments carry this line near the top:

```
Modified by ygreat for Estate, 2026. Originally part of Terax.
```

Files that can't hold comments, such as JSON, are listed here instead, along with Terax files Estate has removed.

## Modified files without a comment notice

| File | Change |
| --- | --- |
| `src-tauri/tauri.conf.json` | Product name, bundle identifier, window title, publisher, copyright line, minimum macOS version, updater endpoint and updater artifacts changed for Estate. Version restarted at 0.1.0. |
| `package.json` | Version restarted at 0.1.0 (Terax was 0.9.0). Package name and the `@estate/ghostty-core` dependency renamed from Terax. |
| `src-tauri/tauri.windows.conf.json` | Terax names changed to Estate. |
| `packages/ghostty-core/package.json` | Package renamed from `@terax/ghostty-core` to `@estate/ghostty-core`. |
| `.size-limit.json` | Font file names changed to Estate. Total client JS budget raised from 1505 KB to 1560 KB for split view and chat mode (both load lazily; the startup budget is unchanged). |
| `src/modules/ai/lib/pathPolicy.json` | Terax names changed to Estate. |
| `scripts/app-lab/experiments/tab-switch-toggles.patch` | Terax names changed to Estate. |
| `AGENTS.md`, `CLAUDE.md` | Point to `ESTATE.md` instead of `TERAX.md`. |
| `pnpm-lock.yaml`, `src-tauri/Cargo.lock` | Package names changed to Estate. |

## Renamed from Terax to Estate

On 9 November 2026 Estate renamed Terax's names in the code to Estate: crates, binaries, the CLI and its install name, environment variables, shell-integration functions, storage keys, Keychain service, events, CSS classes, types and log prefixes. Each file this changed carries the notice above or is listed in this document.

| Terax path | Estate path |
| --- | --- |
| `TERAX.md` | `ESTATE.md` |
| `src-tauri/crates/terax-cli/` | `src-tauri/crates/estate-cli/` |
| `src-tauri/crates/terax-control-protocol/` | `src-tauri/crates/estate-control-protocol/` |
| `packages/ghostty-core/lib/adapted/TeraxGhostty.ts` | `packages/ghostty-core/lib/adapted/EstateGhostty.ts` |
| `src/assets/fonts/terax-terminal-symbols.woff2` | `src/assets/fonts/estate-terminal-symbols.woff2` |
| `src/assets/fonts/terax-terminal-symbols-mdi.woff2` | `src/assets/fonts/estate-terminal-symbols-mdi.woff2` |
| `src/modules/theme/themes/terax-default.ts` | `src/modules/theme/themes/estate-default.ts` |

Some Terax names are kept on purpose, because the compiled WebAssembly terminal core (`packages/ghostty-core/adapted/*.wasm`) depends on them and changing them needs a rebuild of that core: the `terax_blocks` prompt option, the `terax` WebAssembly import namespace, and the Zig sources and build names under `packages/ghostty-core/adapted/wasm/` (`terax.zig`, `terax-ghostty-vt`). Lineage documents (`packages/ghostty-core/**/*.md`, `UPSTREAM.md` files), patches and license files are also unchanged.

## Estate files that are not from Terax

`NOTICE`, `MODIFICATIONS.md`, `PRD Estate.md` and `rust-toolchain.toml`.

## Removed files

| File | Reason |
| --- | --- |
| `.github/workflows/signpath-test.yml` | Windows code signing for the Terax repository only. |
| `.github/workflows/update-nix-sources.yml` | Updated Nix sources for Terax's Linux releases, which Estate doesn't package. |
| `flake.nix`, `flake.lock`, `nix/` | Nix packaging that downloaded Terax's prebuilt Linux and macOS releases. Estate doesn't package for Nix. |
| `terax-icon.png` | Terax logo, not used by the app. |
| `docs/readme/README.*.md` (11 translations) | Translations of the Terax README; they described Terax, not Estate. Available in the Terax repository and this repository's history. |
