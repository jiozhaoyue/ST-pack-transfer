---
title: Storage engine conversion
layout: default
lang: en
alt_url: engines.html
alt_lang: zh-CN
---

# Storage engine conversion (Luker only)

Luker can store user data in several backends: plain file system, PostgreSQL, MySQL, and SQLite. This feature converts between them without manually setting up temporary databases.

## What it does

When the target platform is **Luker**, the chart panel shows a **Storage engine** option. **After selecting a package inside a Luker host, the target engine switches automatically to the source engine declared by that package** (file system / PostgreSQL / MySQL / SQLite), so you do not have to reselect it every time:

- **Follow source package**: keep the original storage form.
- **File system**: convert to a plain file directory layout.
- **PostgreSQL**: convert to a PostgreSQL dump package.
- **MySQL**: convert to a MySQL dump package.
- **SQLite**: convert to a single-file SQLite database package.

Choose the form and generate the package:

- **File system** packages can be imported through the normal tavern restore flow without starting a database service first.
- Database packages contain the standard dump and metadata for that engine and import smoothly.

## Convert in both directions

Convert between the file system and each database engine, and migrate between PostgreSQL and MySQL.

## Are the engine carrier files (bin) required?

- **File-system source packages** contain no `_engine_meta.json` or `_engine_dump.bin`; converting FS to a database does **not** need a bin file.
- **PostgreSQL / MySQL source packages** must keep both `_engine_meta.json` and `_engine_dump.bin`. If the dump is missing, conversion fails before it starts with a clear reason and never produces a partial package.
- **SQLite source packages** keep the single `luker-storage.sqlite` file and do not use `_engine_dump.bin`.
- **Database to file system** needs the dump (or the SQLite database file) to rebuild files; loose files alone are not a complete backup.
- **Database targets** write `_engine_meta.json` plus the engine dump (SQLite writes `luker-storage.sqlite`).

### Fast and safe path

- File system to file system: move directories directly, without the database row model.
- File system to database: use the canonical row model plus the target engine sink, table by table.
- Database to file system: validate `_engine_meta.json` and the dump first, then rebuild files from rows.
- PostgreSQL to MySQL: use the same canonical row model, without intermediate SQL text.
- Load sql.js only when SQLite is actually involved.
- Stream large packages instead of reading the whole archive into memory.

## Smooth cross-tavern migration

When a Luker database package is migrated to a file-based tavern such as SillyTavern, TauriTavern, or PureTavern, the plugin parses the database records and restores the standard user file structure, preserving character cards, settings, and chats.

## Local privacy and safety

- **Fully local**: unpacking, conversion, and packing run in the browser. Chat data is not uploaded and no external database connection is required.
- **Clear validation**: unknown or damaged source files produce a clear error in the log so you can check package integrity.
