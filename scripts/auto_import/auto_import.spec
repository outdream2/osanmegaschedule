# PyInstaller build spec · Megatown Auto Import
# 2026-08-27 · #77 · One-click install (Python-free · single EXE)
#
# Usage · 개발자 · 로컬에서 EXE 빌드:
#   pip install pyinstaller
#   pyinstaller scripts/auto_import/auto_import.spec
#
# Output · dist/auto_import.exe (~15-20MB · Python 없이 실행 가능)

# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['auto_import.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['requests', 'configparser', 'watchdog', 'watchdog.observers', 'watchdog.events'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'PIL', 'pandas'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='auto_import',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
