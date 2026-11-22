"""Pack app/ (recursively, data/ included) into dist/<id>-<version>.otzplugin (a zip, manifest.json at the root).
Install by opening the file with Otzaria (file association application/x-otzaria-plugin)."""
import json, os, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
app = os.path.normpath(os.path.join(HERE, '..', 'app'))
dist = os.path.normpath(os.path.join(HERE, '..', 'dist'))
man = json.load(open(os.path.join(app, 'manifest.json'), encoding='utf-8'))
os.makedirs(dist, exist_ok=True)
out = os.path.join(dist, f"{man['id']}-{man['version']}.otzplugin")
files = []
for root, _, names in os.walk(app):
    for n in names:
        p = os.path.join(root, n)
        files.append(os.path.relpath(p, app).replace(os.sep, '/'))
files.sort()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(os.path.join(app, f), f)
print(out, os.path.getsize(out), len(files), 'files')
