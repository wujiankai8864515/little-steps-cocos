from PIL import Image

def pack(rectangles,width,height):
    free=[(0,0,width,height)];placed={}
    for key,img in sorted(rectangles.items(),key=lambda kv:max(kv[1].size),reverse=True):
        w,h=img.size;w+=4;h+=4
        fits=[(min(r[2]-w,r[3]-h),max(r[2]-w,r[3]-h),r[1],r[0],r) for r in free if r[2]>=w and r[3]>=h]
        if not fits: return None
        *_,chosen=min(fits);x,y=chosen[:2];used=(x,y,w,h);new=[]
        for fx,fy,fw,fh in free:
            if x>=fx+fw or x+w<=fx or y>=fy+fh or y+h<=fy:new.append((fx,fy,fw,fh));continue
            if x>fx:new.append((fx,fy,x-fx,fh))
            if x+w<fx+fw:new.append((x+w,fy,fx+fw-x-w,fh))
            if y>fy:new.append((fx,fy,fw,y-fy))
            if y+h<fy+fh:new.append((fx,y+h,fw,fy+fh-y-h))
        free=[]
        for i,r in enumerate(new):
            if any(i!=j and r[0]>=s[0] and r[1]>=s[1] and r[0]+r[2]<=s[0]+s[2] and r[1]+r[3]<=s[1]+s[3] and (r!=s or i>j) for j,s in enumerate(new)):continue
            free.append(r)
        placed[key]=(x+2,y+2,img.width,img.height)
    return placed
