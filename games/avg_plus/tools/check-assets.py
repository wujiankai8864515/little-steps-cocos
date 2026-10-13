#!/usr/bin/env python3
"""Check ownership, original UUID preservation, serialized references and content."""
import json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
errors=[];uuids={}
for p in (root/'assets').rglob('*.meta'):
 try:data=json.loads(p.read_text())
 except Exception as e:errors.append(f'{p}: {e}');continue
 uid=data.get('uuid')
 if uid in uuids:errors.append(f'重复 UUID: {p} / {uuids[uid]}')
 if uid:uuids[uid]=p
for p in (root/'assets/art').rglob('*'):
 if p.suffix in ['.ts','.js']:errors.append(f'资产层包含脚本: {p}')
for p in (root/'assets/foundation').rglob('*.ts'):
 text=p.read_text()
 if re.search(r"from\s+['\"][^'\"]*(?:mods|art|cc)['\"]",text):errors.append(f'基础框架反向依赖: {p}')
for p in (root/'assets/mods').rglob('manifest.json'):
 generated=p.with_name('ModManifest.ts').read_text()
 if json.loads(p.read_text())!=json.loads(generated.split('export const manifest = ',1)[1].split(' as const;',1)[0]):errors.append(f'清单与代码不一致: {p}')
for p in (root/'assets/art/dramas').rglob('chapters/**/*.json'):
 value=json.loads(p.read_text())
 if not all(k in value for k in ['chapter','page','background','roles','dialogue','choices']):errors.append(f'剧情缺少字段: {p}')
for p in (root/'assets').rglob('*.prefab'):
 data=json.loads(p.read_text());limit=len(data)
 def walk(v):
  if isinstance(v,dict):
   if '__id__' in v and not 0<=v['__id__']<limit:errors.append(f'Prefab 内部引用越界: {p}')
   for x in v.values():walk(x)
  elif isinstance(v,list):
   for x in v:walk(x)
 walk(data)
baseline=root/'docs/migration-uuid-baseline.json'
if baseline.exists():
 for uid in json.loads(baseline.read_text()):
  if uid not in uuids:errors.append(f'迁移丢失原 UUID: {uid}')
if errors:
 print('\n'.join(errors));sys.exit(1)
print(f'Asset checks passed: {len(uuids)} primary UUIDs, foundation boundary, mod manifests, content and prefab structure')
