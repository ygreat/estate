<!-- Estate file; not part of Terax. -->
# Modifications

Estate is derived from Terax (https://github.com/crynta/terax-ai), copyright 2026 Crynta, licensed under Apache-2.0. Section 4(b) of the license requires modified files to carry a notice saying they were changed.

Files that can hold comments carry this line near the top:

```
Modified by ygreat for Estate, 2026. Originally part of Terax.
```

Files that can't hold comments, such as JSON, are listed here instead, along with Terax files Estate has removed.

## Modified files without a comment notice

| File | Change |
| --- | --- |
| `src-tauri/tauri.conf.json` | Product name, bundle identifier, window title, publisher, copyright line, minimum macOS version, updater endpoint and updater artifacts changed for Estate. |

## Removed files

| File | Reason |
| --- | --- |
| `docs/readme/README.*.md` (11 translations) | Translations of the Terax README; they described Terax, not Estate. Available in the Terax repository and this repository's history. |
