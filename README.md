# AAG Shnayim Mikra (שניים מקרא ואחד תרגום)

An Otzaria plugin (tool tab) for reading *Shnayim Mikra Ve'echad Targum* with each verse as its own paragraph:
the verse twice (two colors), then Targum Onkelos, with optional Rashi. Fully offline.

## Features
- Parasha mode and chapter/verse mode; prev/next navigation.
- Weekly parasha by date (own Hebrew-calendar code, `app/calendar.js`), Israel or diaspora, combined parashot.
  Verified identical to an independent hebcal-based implementation for every Shabbat 2000–2090, both locations (`tools/caltest.js`).
- End of the reading: last verse twice more, then the first 3 verses of the next parasha (after Vezot Haberacha → Bereshit).
- Aliyot markers, nikud and te'amim toggles, font size (16–80 px, default 32), colors for each reading and the Targum.
- Haftarah (Ashkenaz / Sefard); on a dated week the special Shabbat (Shekalim, Zachor, Parah, HaChodesh, HaGadol,
  Rosh Chodesh, Machar Chodesh, Chanukah, Shuva, Pinchas after 17 Tammuz) is noted, with a switch to the regular one.
- Bookmark: click a verse number; "📌 המשך" returns to it. Settings saved in Otzaria plugin storage (localStorage fallback).

## Layout
- `app/` — the plugin (manifest.json, index.html, app.js, calendar.js, style.css, data/*.js).
- `tools/build_data.py` — builds `app/data/` from the local Sefaria export (Masorah text, Onkelos, Rashi, parasha/aliyot schema, haftarot).
- `tools/package_plugin.py` — writes `dist/<id>-<version>.otzplugin`.
- `tools/caltest.js` — calendar comparison test.

## Build / test / install
```
python3 tools/build_data.py
python3 tools/package_plugin.py
node tools/caltest.js <other calendar.js> app/calendar.js
xdg-open dist/com.aag.shnayim-mikra-0.2.15.otzplugin   # then confirm in Otzaria
```
Standalone test: serve `app/` with any static server and open index.html in a browser.

## Known limits
- The haftarah table was written by hand; not yet cross-checked against an external list.
- The first 3 verses of the next parasha are shown as Mikra once (not twice + Targum).
