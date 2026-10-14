# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files

# Ship only assets used at runtime. The SVG source files are design sources;
# the widget renders their checked PNG counterparts.
datas = [
    ('assets/data/cities15000.json.gz', 'assets/data'),
    ('assets/fonts/Inter-Variable.ttf', 'assets/fonts'),
    ('assets/fonts/OFL.txt', 'assets/fonts'),
    ('assets/icons/*.png', 'assets/icons'),
    ('assets/icons/*LICENSE.txt', 'assets/icons'),
    ('assets/icons/*NOTICE.txt', 'assets/icons'),
]
datas += collect_data_files('tzdata')


a = Analysis(
    ['world_clock_widget.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # This is a fully local desktop widget. Pathlib exposes optional URL
    # helpers, which otherwise pull an unused TLS/FTP/HTTP stack and OpenSSL
    # DLLs into the bundle. Normal filesystem paths continue to work.
    excludes=[
        '_ssl',
        '_hashlib',
        'hashlib',
        'ssl',
        'ftplib',
        'http.client',
        'http.cookiejar',
        'urllib.request',
        'urllib.response',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='WorldClockWidget',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version='version_info.txt',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='WorldClockWidget',
)
