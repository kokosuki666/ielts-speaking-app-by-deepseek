/**
 * electron-builder afterPack hook.
 *
 * We embed the icon and version info with resedit (pure JS) instead of the
 * default rcedit path: winCodeSign needs symlink privileges while extracting,
 * which fails on locked-down Windows machines.
 */
const fs = require('fs');
const path = require('path');
const { NtExecutable, NtExecutableResource, Resource, Data } = require('resedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appInfo = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  if (!fs.existsSync(exePath)) {
    console.warn('[after-pack] exe not found:', exePath);
    return;
  }

  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    console.warn('[after-pack] icon not found:', iconPath);
    return;
  }

  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);
  const iconFile = Data.IconFile.from(fs.readFileSync(iconPath));

  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups[0]?.id ?? 1;
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groupId,
    1033,
    iconFile.icons.map((icon) => icon.data),
  );

  const versions = Resource.VersionInfo.fromEntries(res.entries);
  if (versions.length) {
    const vi = versions[0];
    const [major = 1, minor = 0, patch = 0] = String(appInfo.version).split('.').map((n) => Number(n) || 0);
    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        ProductName: appInfo.productName || 'IELTS Speaking Studio',
        FileDescription: appInfo.productName || 'IELTS Speaking Studio',
        CompanyName: 'IELTS Speaking Studio',
        LegalCopyright: 'IELTS Speaking Studio',
        OriginalFilename: path.basename(exePath),
        InternalName: path.basename(exePath, '.exe'),
      },
    );
    vi.setFileVersion(major, minor, patch, 0);
    vi.setProductVersion(major, minor, patch, 0);
    vi.outputToResourceEntries(res.entries);
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('[after-pack] icon + version written to', path.basename(exePath));
};
