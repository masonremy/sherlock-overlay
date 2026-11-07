# data/

Everything here is yours: your copy of the game's files and what you make while playing. Git ignores this folder (apart from this file), so none of it is published, and updating the code never touches it.

| Path | What | Made by |
| --- | --- | --- |
| `artifacts/` | The game's PDFs: newspapers, directory, informants. Any subfolders. | You (see `SETUP.md`) |
| `artifacts/.index/` | The PDFs' text, indexed for search. Rebuilt automatically. | The app |
| `maps/` | Map images and their zones (`<id>.json`), shared by every case | The Zones editor |
| `cases/` | One folder per case: its trail, cast, notes and keys, plus rolling backups | The control panel |
| `portraits/` | The portrait library, shared by every case | Cast tab › Portrait library |
| `papers/` | Newspaper dates and titles (`library.json`) | Paper tab |
| `icons/` | Optional toolkit artwork: `map`, `newspaper`, `notes`, `directory`, `informants` (`.png`, `.jpg`, `.webp`, `.svg`) | You |
| `fonts/` | Uploaded fonts | Layout tab › Fonts |
| `layouts.json` | Saved overlay layouts | Layout tab |
| `theme.json` | Font settings | Layout tab › Fonts |

To keep your work, back up this folder. To use a data folder somewhere else, set the `DATA_DIR` environment variable to its path before starting.
