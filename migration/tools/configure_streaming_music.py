#!/usr/bin/env python3
"""Pin unchanged MP3 payloads and Godot's existing streamed reservations."""
from legacy_source import legacy_reference
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
SOURCE=legacy_reference()
def main():
    source=SOURCE/'games/travel_woodfish/project/config/resource_groups.json'
    original=json.loads(source.read_text());path=ROOT/'games/xiaoyu-cocos/assets/resources/source-catalog.json';catalog=json.loads(path.read_text());rows=[]
    for name in ['day_harp_mouse','night_peaceful_mind']:
        key=f'res://home/audio/tracks/{name}.mp3';spec=catalog['assets'][key];audio=ROOT/'games/xiaoyu-cocos/assets/bundles'/spec['bundle']/(spec['path']+'.mp3');digest=hashlib.sha256(audio.read_bytes()).hexdigest();assert digest==spec['audio']['embeddedPayload256'];size=audio.stat().st_size;reserved=original['estimated_bytes'][key];assert reserved==size*2+2*1024*1024
        spec['streaming']={'extension':'.mp3','encodedBytes':size,'reservedBytes':reserved,'payloadSHA256':digest};rows.append({'resource':key,'fullDecodedPCMBytes':spec['decodedBytes'],**spec['streaming']})
    path.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
    record={'schema':1,'id':'M09.01','status':'source_streamed_transport_declared_actual_engine_backend_and_lifecycle_pending','source':{'path':str(source.relative_to(SOURCE)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()},'music':rows,'reservation':'Original Godot estimate: two encoded payload copies +2MiB stream/player buffers. Full PCM estimate remains stored separately; low reservation requires actual DOM_AUDIO or MINIGAME_AUDIO, otherwise load fails. Estimate is not measured browser/device memory.','unchangedLimits':{'entries':128,'bytes':256*1024*1024,'specsPerBatch':80,'homeFirstDownload':19000000},'audioBytes':'Original embedded MP3 bytes unchanged; no recoding','pending':['actual requested native URLs and load types','actual play, gains, pause/resume, cancellation and release','Home cold download budget still separate','WeChat device/backend and memory']}
    (ROOT/'migration/records/M09-streaming-music-source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'tracks':len(rows),'fullPCMBytes':sum(r['fullDecodedPCMBytes'] for r in rows),'streamReservedBytes':sum(r['reservedBytes'] for r in rows)}))
if __name__=='__main__':main()
