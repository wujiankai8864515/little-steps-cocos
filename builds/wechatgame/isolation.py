"""Keep loading independent; relocate only the frozen Creator packaging copy."""
import hashlib
import json
import re
import shutil

def prepare(project,stage):
    assets=project/'assets'
    if not (assets/'startup/LoadingView.ts').is_file():return []
    source=assets/'resources';target=assets/'bundles/runtime_data'
    if target.exists():raise ValueError('Unexpected runtime data directory')
    shutil.move(str(source),target)
    meta=assets/'resources.meta';data=json.loads(meta.read_text());meta.unlink()
    data['userData'].update(isBundle=True,bundleName='runtime_data',priority=6,bundleConfigID='little-steps-subpackage')
    target.with_suffix('.meta').write_text(json.dumps(data,indent=2)+'\n')
    path=target/'source-catalog.json';catalog=json.loads(path.read_text())
    alpha=catalog['groups']['loading'].pop('cocosAlpha',None)
    if alpha:
        unused=assets/'bundles/loading'/(alpha['path']+'.json')
        unused.unlink();unused.with_suffix('.json.meta').unlink()
    for name,dependencies in [('framework_code',[]),('runtime_data',[]),('gameplay_code',['framework_code','runtime_data'])]:
        catalog['groups'][name]={'resources':[],'depends_on':dependencies,'priority':6,'readiness':'loaded_after_loading_first_draw'}
    catalog['groups']['home']['depends_on'].append('gameplay_code')
    path.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
    # Refresh the small manifest from packaging transport dimensions/reservations.
    manifest_path=assets/'bundles/loading/startup-manifest.json';manifest=json.loads(manifest_path.read_text())
    for item in manifest['images']:
        spec=next(s for s in catalog['assets'].values() if s['bundle']=='loading' and s.get('path')==item['path'])
        item['decodedBytes']=spec['decodedBytes']
    manifest['reservedBytes']=sum(i['decodedBytes'] for i in manifest['images'])+128*288*8+(assets/'bundles/loading/entry/assets/loading_ui.ttf').stat().st_size
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
    return [{'purpose':'Isolate loading from full catalog/scenes/effects and common gameplay code',
             'relocatedFrom':str(source.relative_to(stage)),'relocatedTo':str(target.relative_to(stage)),
             'loadingReservedBytes':manifest['reservedBytes']}]

def finalize(output):
    settings_path=next((output/'src').glob('settings*.json'))
    settings=json.loads(settings_path.read_text())
    if 'runtime_data' not in settings['assets'].get('projectBundles',[]):return None
    plugins=settings['plugins']['jsList'];scripts=[p for p in plugins if re.fullmatch(r'assets/plugins/travel-core(?:\.[0-9a-f]+)?\.js',p)]
    if len(scripts)!=1:raise ValueError('Expected exactly one readonly framework plugin')
    root=output/'subpackages/framework_code'
    if not root.is_dir():root=output/'assets/framework_code'
    if not root.is_dir():raise ValueError('Missing framework bundle')
    platform=output/'platform.js'
    if not platform.is_file():raise ValueError('Missing channel platform adapter')
    application=next(output.glob('application.*.js'));application_text=application.read_text()
    entry=output/'game.js';entry_text=entry.read_text()
    if application_text.count(settings_path.name)!=1 or entry_text.count(application.name)!=1:raise ValueError('Creator entry references changed')
    for relative in scripts:
        original=output/'src'/relative
        if not original.is_file() or (root/original.name).exists():raise ValueError('Framework plugin layout changed')
    moved=[]
    for relative in scripts:
        original=output/'src'/relative;target=root/original.name
        if not original.is_file() or target.exists():raise ValueError('Framework plugin layout changed')
        before=hashlib.sha256(original.read_bytes()).hexdigest();original.replace(target)
        assert hashlib.sha256(target.read_bytes()).hexdigest()==before
        moved.append(target.relative_to(output).as_posix())
    destination=root/'platform.js';platform.replace(destination)
    settings['plugins']['jsList']=[p for p in plugins if p not in scripts]
    encoded=json.dumps(settings,ensure_ascii=False,separators=(',',':')).encode()
    replacement=settings_path.with_name('settings.'+hashlib.md5(encoded).hexdigest()[:5]+'.json')
    replacement.write_bytes(encoded)
    if replacement!=settings_path:settings_path.unlink()
    text=application_text
    text=text.replace(settings_path.name,replacement.name);new_application=application.with_name('application.'+hashlib.md5(text.encode()).hexdigest()[:5]+'.js');new_application.write_text(text)
    if new_application!=application:application.unlink()
    text=entry_text
    entry.write_text(text.replace(application.name,new_application.name))
    # WeChat's require is a JS-module loader, not Node's JSON loader.
    (output/'runtime-framework.js').write_text('module.exports = '+json.dumps({'scripts':moved,'platform':destination.relative_to(output).as_posix()})+';\n')
    return {'deferredFrameworkScripts':moved,'loadingFirstDrawBeforeRuntime':True}
