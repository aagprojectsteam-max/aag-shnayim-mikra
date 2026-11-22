// Compare app/calendar.js against another weekly-parasha implementation (used only as a test oracle).
// Usage: node tools/caltest.js <oracle calendar.js> app/calendar.js
const vm = require('vm'), fs = require('fs');
const [, , oracle, mine] = process.argv;
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(oracle, 'utf8') + ';this.sedraLookup=sedraLookup;this.gregToAbs=gregToAbs;', ctx);
const g = {}; g.globalThis = g; vm.createContext(g); vm.runInContext(fs.readFileSync(mine, 'utf8'), g);
const C = g.SMCal; const bad = { i: 0, d: 0 }; let tot = 0; const ex = [];
for (let rd = C.shabbatOnOrAfter(C.fromGreg(2000, 1, 1)); rd < C.fromGreg(2090, 1, 1); rd += 7) {
  const dt = C.toDate(rd); const abs = ctx.gregToAbs(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  for (const il of [true, false]) {
    tot++;
    const o = ctx.sedraLookup(abs, il); const m = C.readingFor(rd, il);
    const os = o ? o.join('-') : 'H', ms = m.hol ? 'H' : m.p.join('-');
    if (os !== ms) { bad[il ? 'i' : 'd']++; if (ex.length < 25) ex.push(`${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()} ${il ? 'IL' : 'DI'} oracle=${os} mine=${ms} heb=${JSON.stringify(C.toHeb(rd))}`); }
  }
}
console.log('total', tot, 'bad', JSON.stringify(bad)); console.log(ex.join('\n'));
