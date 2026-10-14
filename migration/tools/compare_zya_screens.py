#!/usr/bin/env python3
"""Compare actual Cocos canvas pixels against a named public screenshot.

Always reports full-image error. A comparison result is not device acceptance.
No arbitrary UI region is hidden or replaced with reference pixels.
"""
from pathlib import Path
import argparse
import json
import hashlib
import numpy as np
from PIL import Image, ImageDraw


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--reference',type=Path,required=True)
    parser.add_argument('--actual',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    reference=Image.open(args.reference).convert('RGB')
    actual=Image.open(args.actual).convert('RGB')
    before_size=actual.size
    if actual.size!=reference.size:
        actual=actual.resize(reference.size,Image.Resampling.LANCZOS)
    a=np.asarray(actual,dtype=np.int16);r=np.asarray(reference,dtype=np.int16)
    delta=np.abs(a-r);heat=Image.fromarray(np.minimum(255,delta*4).astype(np.uint8))
    width,height=reference.size
    board=Image.new('RGB',(width*3,height+32),'#ffffff');d=ImageDraw.Draw(board)
    for i,(title,im)in enumerate([('PUBLIC REFERENCE',reference),('ACTUAL COCOS CANVAS',actual),('ABS DIFFERENCE x4',heat)]):
        board.paste(im,(i*width,32));d.text((i*width+8,9),title,fill='black')
    args.output.parent.mkdir(parents=True,exist_ok=True);board.save(args.output.with_suffix('.png'))
    result={'reference':str(args.reference),'actual':str(args.actual),'referenceSHA256':hashlib.sha256(args.reference.read_bytes()).hexdigest(),
            'actualSHA256':hashlib.sha256(args.actual.read_bytes()).hexdigest(),'referenceSize':[width,height],'canvasSize':before_size,
            'resize':'none' if before_size==reference.size else 'Declared Lanczos scaling to reference size',
            'fullImageMAE':float(delta.mean()),'exactPixelFraction':float(np.all(delta==0,axis=2).mean()),
            'pixelsOver10Fraction':float((delta.max(axis=2)>10).mean()),
            'strict1to1':'unproven' if np.any(delta) else 'exact pixels matched',
            'device':'pending','scope':'Whole image, no masked game regions. Different state/timing/version must be resolved before acceptance.'}
    args.output.with_suffix('.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
