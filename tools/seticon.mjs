import * as ResEdit from 'resedit';
import * as PELibrary from 'pe-library';
import fs from 'fs';
const [exe, ico, out, ver = '1.00'] = process.argv.slice(2);
const [maj, min = '00'] = ver.split('.');
const vv = [+maj, +(min[0] || 0), +(min[1] || 0), 0];
const data = fs.readFileSync(exe);
const e = PELibrary.NtExecutable.from(data, { ignoreCert: true });
const res = PELibrary.NtExecutableResource.from(e);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const lang = groups.length ? groups[0].lang : 1033;
const id = groups.length ? groups[0].id : 1;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, iconFile.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
for (const v of vi) {
  v.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: "LMP - Leo's Material Painter", ProductName: "LMP - Leo's Material Painter", CompanyName: 'LeoDevRX', LegalCopyright: 'Owned by LeoDevRX', OriginalFilename: 'LMP.exe', InternalName: 'LMP' });
  v.setFileVersion(...vv, 1033);
  v.setProductVersion(...vv, 1033);
  v.outputToResourceEntries(res.entries);
}
res.outputResource(e);
fs.writeFileSync(out, Buffer.from(e.generate()));
console.log('ok', groups.length, vi.length);
