"""Build the plugin's offline data from the local Sefaria export.

Output (app/data/):
  meta.js      window.SM_META  = books, chapter/verse counts, 54 parashot with 7 aliyot, haftarah table
  book1..5.js  window.SM_BOOK[n] = [[ [mikra, onkelos, [rashi...]], ...verses ], ...chapters]
  haftarot.js  window.SM_HAFT  = { "<ref>": [[label, text], ...] }  (only the passages the table needs)

Sources (read-only):
  Torah   : Miqra according to the Masorah (CC-BY-SA)
  Onkelos : Sefaria "Onkelos <Book>" Hebrew
  Rashi   : Sefaria Rashi on <Book> merged (Rosenbaum-Silbermann, public domain)
  Prophets: Miqra according to the Masorah
"""
import json, os, re, sys

SEF = '/mnt/data/AI/Data/Sefaria/sefaria-data/sefaria-export'
TAN = SEF + '/json/Tanakh'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'app', 'data'))

BOOKS = [('Genesis', 'בראשית'), ('Exodus', 'שמות'), ('Leviticus', 'ויקרא'),
         ('Numbers', 'במדבר'), ('Deuteronomy', 'דברים')]

PROPHETS = {
    'Joshua': 'יהושע', 'Judges': 'שופטים', 'I Samuel': 'שמואל א', 'II Samuel': 'שמואל ב',
    'I Kings': 'מלכים א', 'II Kings': 'מלכים ב', 'Isaiah': 'ישעיהו', 'Jeremiah': 'ירמיהו',
    'Ezekiel': 'יחזקאל', 'Hosea': 'הושע', 'Joel': 'יואל', 'Amos': 'עמוס', 'Obadiah': 'עובדיה',
    'Micah': 'מיכה', 'Zechariah': 'זכריה', 'Malachi': 'מלאכי',
}

# Regular weekly haftarot: parasha index -> (Ashkenaz, Sefard). Ranges "Book c:v-c:v", parts joined by "; ".
HAFT = [
    ('Isaiah 42:5-43:10', 'Isaiah 42:5-42:21'),
    ('Isaiah 54:1-55:5', 'Isaiah 54:1-54:10'),
    ('Isaiah 40:27-41:16', None),
    ('II Kings 4:1-4:37', 'II Kings 4:1-4:23'),
    ('I Kings 1:1-1:31', None),
    ('Malachi 1:1-2:7', None),
    ('Hosea 12:13-14:10', 'Hosea 11:7-12:12'),
    ('Hosea 11:7-12:12', 'Obadiah 1:1-1:21'),
    ('Amos 2:6-3:8', None),
    ('I Kings 3:15-4:1', None),
    ('Ezekiel 37:15-37:28', None),
    ('I Kings 2:1-2:12', None),
    ('Isaiah 27:6-28:13; Isaiah 29:22-29:23', 'Jeremiah 1:1-2:3'),
    ('Ezekiel 28:25-29:21', None),
    ('Jeremiah 46:13-46:28', None),
    ('Judges 4:4-5:31', 'Judges 5:1-5:31'),
    ('Isaiah 6:1-7:6; Isaiah 9:5-9:6', 'Isaiah 6:1-6:13'),
    ('Jeremiah 34:8-34:22; Jeremiah 33:25-33:26', None),
    ('I Kings 5:26-6:13', None),
    ('Ezekiel 43:10-43:27', None),
    ('I Kings 18:1-18:39', 'I Kings 18:20-18:39'),
    ('I Kings 7:40-7:50', 'I Kings 7:13-7:26'),
    ('I Kings 7:51-8:21', 'I Kings 7:40-7:50'),
    ('Isaiah 43:21-44:23', None),
    ('Jeremiah 7:21-8:3; Jeremiah 9:22-9:23', None),
    ('II Samuel 6:1-7:17', 'II Samuel 6:1-6:19'),
    ('II Kings 4:42-5:19', None),
    ('II Kings 7:3-7:20', None),
    ('Ezekiel 22:1-22:19', 'Ezekiel 22:1-22:16'),
    ('Amos 9:7-9:15', 'Ezekiel 20:2-20:20'),
    ('Ezekiel 44:15-44:31', None),
    ('Jeremiah 32:6-32:27', None),
    ('Jeremiah 16:19-17:14', None),
    ('Hosea 2:1-2:22', None),
    ('Judges 13:2-13:25', None),
    ('Zechariah 2:14-4:7', None),
    ('Joshua 2:1-2:24', None),
    ('I Samuel 11:14-12:22', None),
    ('Judges 11:1-11:33', None),
    ('Micah 5:6-6:8', None),
    ('I Kings 18:46-19:21', None),
    ('Jeremiah 1:1-2:3', None),
    ('Jeremiah 2:4-2:28; Jeremiah 3:4-3:4', 'Jeremiah 2:4-2:28; Jeremiah 4:1-4:2'),
    ('Isaiah 1:1-1:27', None),
    ('Isaiah 40:1-40:26', None),
    ('Isaiah 49:14-51:3', None),
    ('Isaiah 54:11-55:5', None),
    ('Isaiah 51:12-52:12', None),
    ('Isaiah 54:1-54:10', None),
    ('Isaiah 60:1-60:22', None),
    ('Isaiah 61:10-63:9', None),
    ('Hosea 14:2-14:10; Joel 2:15-2:27', 'Hosea 14:2-14:10; Micah 7:18-7:20'),
    ('II Samuel 22:1-22:51', None),
    ('Joshua 1:1-1:18', 'Joshua 1:1-1:9'),
]

# Special Shabbatot (shown as a note with their own text when the Shabbat date is known).
SPECIAL = {
    'shekalim': ('שבת שקלים', 'II Kings 12:1-12:17', 'II Kings 11:17-12:17'),
    'zachor': ('שבת זכור', 'I Samuel 15:2-15:34', 'I Samuel 15:1-15:34'),
    'parah': ('שבת פרה', 'Ezekiel 36:16-36:38', 'Ezekiel 36:16-36:36'),
    'hachodesh': ('שבת החודש', 'Ezekiel 45:16-46:18', 'Ezekiel 45:18-46:15'),
    'hagadol': ('שבת הגדול', 'Malachi 3:4-3:24', None),
    'roshchodesh': ('שבת ראש חודש', 'Isaiah 66:1-66:24', None),
    'macharchodesh': ('שבת מחר חודש', 'I Samuel 20:18-20:42', None),
    'chanukah1': ('שבת חנוכה', 'Zechariah 2:14-4:7', None),
    'chanukah2': ('שבת שנייה של חנוכה', 'I Kings 7:40-7:50', None),
    'shuva': ('שבת שובה', 'Hosea 14:2-14:10; Joel 2:15-2:27', 'Hosea 14:2-14:10; Micah 7:18-7:20'),
    'pinchas_bein': ('שבת בין המצרים', 'Jeremiah 1:1-2:3', None),
}

TAG_KEEP = re.compile(r'</?(b|big|small)>')


def clean_mikra(s):
    s = re.sub(r'<sup class="footnote-marker">.*?</sup>', '', s)
    s = re.sub(r'<i class="footnote">.*?</i>', '', s, flags=re.S)
    s = s.replace('<span class="mam-spi-pe">{פ}</span>', '\u0001P')
    s = s.replace('<span class="mam-spi-samekh">{ס}</span>', '\u0001S')
    s = s.replace('<span class="mam-spi-invnun">', '<span class="invnun">')
    s = s.replace('<span class="mam-kq">', '<span class="kq">').replace('<span class="mam-kq-k">', '<span class="kt">')
    s = s.replace('<span class="mam-kq-q">', '<span class="qr">').replace('<span class="mam-kq-trivial">', '<span class="kqt">')
    s = s.replace('<br>', '').replace('&nbsp;', ' ').replace('&thinsp;', ' ')
    s = re.sub(r'<(?!/?(b|big|small|span)\b)[^>]*>', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.replace('\u0001P', '<i class="pt">{פ}</i>').replace('\u0001S', '<i class="pt">{ס}</i>')
    return s


def clean_simple(s):
    s = s.replace('&nbsp;', ' ').replace('&thinsp;', ' ')
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<(?!/?(b|small)\b)[^>]*>', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)['text']


def parse_ref(ref):
    ref = ref.strip().replace('–', '-')
    m = re.fullmatch(r'(.+?) (\d+):(\d+)-(\d+):(\d+)', ref)
    if m:
        return m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
    m = re.fullmatch(r'(.+?) (\d+):(\d+)-(\d+)', ref)
    if m:
        return m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(2)), int(m.group(4))
    raise ValueError(ref)


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {'books': [], 'parashot': [], 'haft': [], 'special': {}}
    for bi, (en, he) in enumerate(BOOKS):
        mk = load(f'{TAN}/Torah/{en}/Hebrew/Miqra according to the Masorah.json')
        on = load(f'{TAN}/Targum/Onkelos/Torah/Onkelos {en}/Hebrew/Onkelos {en}.json')
        ra = load(f'{TAN}/Rishonim on Tanakh/Rashi/Torah/Rashi on {en}/Hebrew/merged.json')
        chapters, counts = [], []
        for ci, ch in enumerate(mk):
            rows = []
            for vi, v in enumerate(ch):
                o = on[ci][vi] if ci < len(on) and vi < len(on[ci]) else ''
                r = ra[ci][vi] if ci < len(ra) and vi < len(ra[ci]) else []
                if isinstance(r, str):
                    r = [r]
                rows.append([clean_mikra(v), clean_simple(o), [clean_simple(x) for x in r if x and x.strip()]])
            chapters.append(rows)
            counts.append(len(rows))
        with open(os.path.join(OUT, f'book{bi + 1}.js'), 'w', encoding='utf-8') as f:
            f.write(f'window.SM_BOOK=window.SM_BOOK||{{}};window.SM_BOOK[{bi}]=')
            json.dump(chapters, f, ensure_ascii=False, separators=(',', ':'))
            f.write(';\n')
        meta['books'].append({'en': en, 'he': he, 'verses': counts})
        schema = json.load(open(f'{SEF}/schemas/{en}.json', encoding='utf-8'))
        for node in schema['alts']['Parasha']['nodes']:
            he_title = next(t['text'] for t in node['titles'] if t['lang'] == 'he' and t.get('primary'))
            aliyot = []
            for r in node['refs']:
                _, c1, v1, c2, v2 = parse_ref(r)
                aliyot.append([bi, c1, v1, c2, v2])
            meta['parashot'].append({'en': node['sharedTitle'], 'he': he_title, 'aliyot': aliyot})
    assert len(meta['parashot']) == 54, len(meta['parashot'])

    # Haftarot text
    needed = set()
    def parts(spec):
        return [p.strip() for p in spec.split(';')] if spec else []
    for a, s in HAFT:
        needed.update(parts(a)); needed.update(parts(s))
    for _, a, s in SPECIAL.values():
        needed.update(parts(a)); needed.update(parts(s))
    cache, haft_text = {}, {}
    for ref in sorted(needed):
        book, c1, v1, c2, v2 = parse_ref(ref)
        if book not in cache:
            cache[book] = load(f'{TAN}/Prophets/{book}/Hebrew/Miqra according to the Masorah.json')
        txt = cache[book]
        verses = []
        c, v = c1, v1
        while (c, v) <= (c2, v2):
            if v > len(txt[c - 1]):
                c, v = c + 1, 1
                continue
            verses.append([c, v, clean_mikra(txt[c - 1][v - 1])])
            v += 1
        assert verses, ref
        haft_text[ref] = verses
    def he_ref(ref):
        book, c1, v1, c2, v2 = parse_ref(ref)
        return [PROPHETS[book], c1, v1, c2, v2]
    for a, s in HAFT:
        meta['haft'].append({'a': parts(a), 's': parts(s) or parts(a)})
    for k, (name, a, s) in SPECIAL.items():
        meta['special'][k] = {'name': name, 'a': parts(a), 's': parts(s) or parts(a)}
    meta['hafRefs'] = {r: he_ref(r) for r in sorted(needed)}
    meta['source'] = ('תורה ונביאים: מקרא על פי המסורה (CC-BY-SA); תרגום אונקלוס ורש"י: מאגר ספריא '
                      '(רש"י: מהדורת רוזנבאום-זילברמן, נחלת הכלל)')
    with open(os.path.join(OUT, 'meta.js'), 'w', encoding='utf-8') as f:
        f.write('window.SM_META=')
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    with open(os.path.join(OUT, 'haftarot.js'), 'w', encoding='utf-8') as f:
        f.write('window.SM_HAFT=')
        json.dump(haft_text, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    for fn in sorted(os.listdir(OUT)):
        print(fn, os.path.getsize(os.path.join(OUT, fn)))


if __name__ == '__main__':
    sys.exit(main())
