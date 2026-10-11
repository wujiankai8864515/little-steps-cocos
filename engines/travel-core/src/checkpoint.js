// Checksummed, recoverable checkpoints. The game supplies schema validation
// and generation ordering; this module knows no save slot or product rule.
function checkpointUtf8(text) {
    const bytes=[];
    for(let i=0;i<text.length;i++) {
        let cp=text.charCodeAt(i);
        if(cp>=0xd800&&cp<=0xdbff) {const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){cp=0x10000+(cp-0xd800)*1024+next-0xdc00;i++;}else cp=0xfffd;}
        else if(cp>=0xdc00&&cp<=0xdfff)cp=0xfffd;
        if(cp<128)bytes.push(cp);else if(cp<2048)bytes.push(192|(cp>>6),128|(cp&63));else if(cp<65536)bytes.push(224|(cp>>12),128|((cp>>6)&63),128|(cp&63));else bytes.push(240|(cp>>18),128|((cp>>12)&63),128|((cp>>6)&63),128|(cp&63));
    }
    return bytes;
}
function checkpointSHA256(text) {
    const bytes=checkpointUtf8(text),length=bytes.length*8;
    bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
    const high=Math.floor(length/4294967296),low=length>>>0;
    for(const word of [high,low])for(let shift=24;shift>=0;shift-=8)bytes.push((word>>>shift)&255);
    const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Int32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let base=0;base<bytes.length;base+=64) {
        for(let i=0;i<16;i++)w[i]=bytes[base+i*4]<<24|bytes[base+i*4+1]<<16|bytes[base+i*4+2]<<8|bytes[base+i*4+3];
        for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-16]+(rotr(b,17)^rotr(b,19)^(b>>>10))+w[i-7];}
        let [a,b,c,d,e,f,g,j]=h;
        for(let i=0;i<64;i++){const t=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,u=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+t)|0;d=c;c=b;b=a;a=(t+u)|0;}
        [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)|0);
    }
    return h.map(v=>('00000000'+(v>>>0).toString(16)).slice(-8)).join('');
}
function checkpointUTF8Length(text) {
    let length=0;
    for(let i=0;i<text.length;i++) {
        const cp=text.charCodeAt(i);
        if(cp>=0xd800&&cp<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){length+=4;i++;}
        else length+=cp<128?1:cp<2048?2:3;
    }
    return length;
}
function checkpointCanonical(value) {
    if(Array.isArray(value))return value.map(checkpointCanonical);
    if(value&&typeof value==='object'){const out={};Object.keys(value).sort().forEach(k=>{Object.defineProperty(out,k,{value:checkpointCanonical(value[k]),writable:true,enumerable:true,configurable:true});});return out;}
    return value;
}
class CheckpointStore {
    constructor(storage,maxBytes=4096){this.storage=storage;this.maxBytes=maxBytes;this.lastError='';this.committed=false;}
    envelope(data){const payload=JSON.stringify(checkpointCanonical(data));return JSON.stringify({payload,sha256:checkpointSHA256(payload)});}
    decode(contents){
        if(typeof contents!=='string'||checkpointUTF8Length(contents)>this.maxBytes)return null;
        try{const box=JSON.parse(contents);if(typeof box.payload!=='string'||checkpointSHA256(box.payload)!==box.sha256)return null;const data=JSON.parse(box.payload);return data&&typeof data==='object'&&!Array.isArray(data)?data:null;}catch(_){return null;}
    }
    read(key){
        this.lastError='';const records=[];let found=false;
        for(const suffix of ['','.tmp','.bak'])try{const contents=this.storage.getItem(key+suffix);if(typeof contents==='string'){found=true;const data=this.decode(contents);if(data)records.push({data,source:key+suffix});}}catch(error){this.lastError='checkpoint_read_failed:'+String(error.name||error);}
        if(found&&!records.length&&!this.lastError)this.lastError='no_valid_saved_generation';return records;
    }
    write(key,data){
        this.lastError='';this.committed=false;const contents=this.envelope(data);
        if(checkpointUTF8Length(contents)>this.maxBytes){this.lastError='save_too_large';return false;}
        try {
            this.storage.setItem(key+'.tmp',contents);if(this.storage.getItem(key+'.tmp')!==contents)throw new Error('verify_temporary_save_failed');
            const before=this.storage.getItem(key);if(typeof before==='string')this.storage.setItem(key+'.bak',before);
            this.storage.setItem(key,contents);if(this.storage.getItem(key)!==contents)throw new Error('verify_committed_save_failed');
            this.committed=true;return true;
        }catch(error){this.lastError='checkpoint_write_failed:'+String(error.message||error);return false;}
    }
}
// File-format migrations may need raw JSON rather than a checksummed envelope.
// Validation and revision selection remain the caller's responsibility.
class RawJSONCheckpointStore extends CheckpointStore {
    envelope(data){return JSON.stringify(checkpointCanonical(data));}
    decode(contents){
        if(typeof contents!=='string'||checkpointUTF8Length(contents)>this.maxBytes)return null;
        try{const data=JSON.parse(contents);return data&&typeof data==='object'&&!Array.isArray(data)?data:null;}catch(_){return null;}
    }
}
Object.assign(api,{CheckpointStore,RawJSONCheckpointStore,checkpointSHA256,checkpointUTF8Length});
