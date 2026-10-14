"""Install the game's versioned icon artwork into the isolated Android export."""
import hashlib
from pathlib import Path
import re
import shutil
import struct

CHANNEL = Path(__file__).resolve().parent


def install(stage, game):
    stage = Path(stage)
    source = stage / game['project'] / 'source/android-icon'
    native = stage / game['project'] / 'native/engine/android'
    generated = stage / 'output/android/proj/res'
    if not source.is_dir() or not native.is_dir():
        raise ValueError('Isolated game icon/native project missing')
    records = []
    for folder, size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
        original = source / 'legacy' / folder / 'ic_launcher.png'
        data = original.read_bytes()
        if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II',data[16:24]) != (size,size):
            raise ValueError('Wrong launcher density size: '+folder)
        target = generated / ('mipmap-'+folder) / 'avg_launcher.png'
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        records.append({'resource':target.relative_to(generated).as_posix(),'size':size,'sha256':hashlib.sha256(data).hexdigest()})
    for folder,size in [('mdpi',108),('hdpi',162),('xhdpi',216),('xxhdpi',324),('xxxhdpi',432)]:
        original=source/'foreground'/folder/'avg_icon_art.png';data=original.read_bytes()
        if data[:8]!=b'\x89PNG\r\n\x1a\n'or struct.unpack('>II',data[16:24])!=(size,size):
            raise ValueError('Wrong adaptive icon density size: '+folder)
        target=generated/('drawable-'+folder)/original.name
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    templates=CHANNEL/'templates/avg-plus-icons'
    for original in templates.rglob('*.xml'):
        relative=original.relative_to(templates)
        # Cocos lists its native and generated res directories at equal priority.
        # Use an application-specific name instead of attempting to override ic_launcher.
        target=generated/relative.parent/relative.name.replace('ic_launcher','avg_launcher')
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(original.read_text().replace('@mipmap/ic_launcher','@mipmap/avg_launcher'))
    manifest=native/'app/AndroidManifest.xml';xml=manifest.read_text()
    xml,count=re.subn(r'android:icon="@mipmap/ic_launcher"',
        'android:icon="@mipmap/avg_launcher"\n        android:roundIcon="@mipmap/avg_launcher_round"',xml)
    if count!=1:raise ValueError('Unexpected Android icon manifest contract')
    xml,count=re.subn(r'android:theme="@android:style/Theme.NoTitleBar.Fullscreen"',
        'android:theme="@style/Theme.AvgPlus"',xml)
    if count!=1:raise ValueError('Unexpected Android launcher theme contract')
    manifest.write_text(xml)
    return {'source':'game/source/android-icon','legacy':records,'adaptive':True,
            'round':True,'monochrome':True,'android12Splash':True,'onlyIsolatedExportModified':True}
