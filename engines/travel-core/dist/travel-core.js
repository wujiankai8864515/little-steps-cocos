/* Creator 3.8.8 plugin; generated from engines/travel-core/src. */
/*!
The feathered line geometry in src/drawing.js is adapted from Godot Engine
4.5.2-stable, servers/rendering/renderer_canvas_cull.cpp.
Source: https://github.com/godotengine/godot/blob/4.5.2-stable/servers/rendering/renderer_canvas_cull.cpp
Git blob: 42ba93c0f2e5d4623400448b364d456611891e0a
SHA-256: a980ed8c3edef57eb50a810d0b2fbd6c7312ae9f6691bbf763423b69178bf3ad

The rounded fill/border geometry in src/stylebox.js is adapted from the same
Godot Engine 4.5.2-stable release, scene/resources/style_box_flat.cpp.
Source: https://github.com/godotengine/godot/blob/4.5.2-stable/scene/resources/style_box_flat.cpp
Git blob: 3562f6641f75c85029387e22db906c136f960405
SHA-256: 11c658db519fb71326fd6b53618c280016425a2268f0fc47d7bc16d5c4e05947
Defaults verified against scene/resources/style_box_flat.h:
Git blob: 7bb29937c67250fc99f573f0ee23a63416df9469
SHA-256: 4ace97e116a91d05b6a67a7ab995cbf2ad4128179a7e76a74e0f4057b357ef2c

Copyright (c) 2014-present Godot Engine contributors (see AUTHORS.md).
Copyright (c) 2007-2014 Juan Linietsky, Ariel Manzur.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

PCG32 XSH-RR and Godot RandomPCG inclusive range adapter:
Adapted to two uint32 words in src/random.js; original unsigned64 arithmetic.
Copyright (c)2014 Melissa O'Neill, pcg-random.org. Apache-2.0.
Pinned Godot4.5.2-stable sources:
core/math/random_pcg.h, blob bfcd3eeeccb836599993c4e7eeafe71df93b5059
core/math/random_pcg.cpp, blob 3f40c0084e0fd10037281b26ff60181737d67bf0
thirdparty/misc/pcg.h, blob 0faab73e6409ef94b3cde25ae606fd8e764a7ef0
thirdparty/misc/pcg.cpp, blob 914a353874d79802ed6ce024f28e77e5968bc85c
License copied from official COPYRIGHT.txt, blob c9464bd8ade4d684df8576826d56dcd834eb3f1f:
                              Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

(a) You must give any other recipients of the Work or
    Derivative Works a copy of this License; and

(b) You must cause any modified files to carry prominent notices
    stating that You changed the files; and

(c) You must retain, in the Source form of any Derivative Works
    that You distribute, all copyright, patent, trademark, and
    attribution notices from the Source form of the Work,
    excluding those notices that do not pertain to any part of
    the Derivative Works; and

(d) If the Work includes a "NOTICE" text file as part of its
    distribution, then any Derivative Works that You distribute must
    include a readable copy of the attribution notices contained
    within such NOTICE file, excluding those notices that do not
    pertain to any part of the Derivative Works, in at least one
    of the following places: within a NOTICE text file distributed
    as part of the Derivative Works; within the Source form or
    documentation, if provided along with the Derivative Works; or,
    within a display generated by the Derivative Works, if and
    wherever such third-party notices normally appear. The contents
    of the NOTICE file are for informational purposes only and
    do not modify the License. You may add Your own attribution
    notices within Derivative Works that You distribute, alongside
    or as an addendum to the NOTICE text from the Work, provided
    that such additional attribution notices cannot be construed
    as modifying the License.

You may add Your own copyright statement to Your modifications and
may provide additional or different license terms and conditions
for use, reproduction, or distribution of Your modifications, or
for any such Derivative Works as a whole, provided Your use,
reproduction, and distribution of the Work otherwise complies with
the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
(function(root) {
'use strict';
const api = Object.create(null);
/*! Pako 2.1.0, unmodified inflate-only distribution.
(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

(C) 1995-2013 Jean-loup Gailly and Mark Adler
(C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
  claim that you wrote the original software. If you use this software
  in a product, an acknowledgment in the product documentation would be
  appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
  misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.
*/
const alphaInflate = (function() { const module = {exports:{}}; const exports = module.exports;
/*! pako 2.1.0 https://github.com/nodeca/pako @license (MIT AND Zlib) */
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).pako={})}(this,(function(e){"use strict";var t=(e,t,i,n)=>{let a=65535&e|0,r=e>>>16&65535|0,o=0;for(;0!==i;){o=i>2e3?2e3:i,i-=o;do{a=a+t[n++]|0,r=r+a|0}while(--o);a%=65521,r%=65521}return a|r<<16|0};const i=new Uint32Array((()=>{let e,t=[];for(var i=0;i<256;i++){e=i;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[i]=e}return t})());var n=(e,t,n,a)=>{const r=i,o=a+n;e^=-1;for(let i=a;i<o;i++)e=e>>>8^r[255&(e^t[i])];return-1^e};const a=16209;var r=function(e,t){let i,n,r,o,s,l,d,f,c,h,u,w,b,m,k,_,g,p,v,x,y,E,R,A;const Z=e.state;i=e.next_in,R=e.input,n=i+(e.avail_in-5),r=e.next_out,A=e.output,o=r-(t-e.avail_out),s=r+(e.avail_out-257),l=Z.dmax,d=Z.wsize,f=Z.whave,c=Z.wnext,h=Z.window,u=Z.hold,w=Z.bits,b=Z.lencode,m=Z.distcode,k=(1<<Z.lenbits)-1,_=(1<<Z.distbits)-1;e:do{w<15&&(u+=R[i++]<<w,w+=8,u+=R[i++]<<w,w+=8),g=b[u&k];t:for(;;){if(p=g>>>24,u>>>=p,w-=p,p=g>>>16&255,0===p)A[r++]=65535&g;else{if(!(16&p)){if(0==(64&p)){g=b[(65535&g)+(u&(1<<p)-1)];continue t}if(32&p){Z.mode=16191;break e}e.msg="invalid literal/length code",Z.mode=a;break e}v=65535&g,p&=15,p&&(w<p&&(u+=R[i++]<<w,w+=8),v+=u&(1<<p)-1,u>>>=p,w-=p),w<15&&(u+=R[i++]<<w,w+=8,u+=R[i++]<<w,w+=8),g=m[u&_];i:for(;;){if(p=g>>>24,u>>>=p,w-=p,p=g>>>16&255,!(16&p)){if(0==(64&p)){g=m[(65535&g)+(u&(1<<p)-1)];continue i}e.msg="invalid distance code",Z.mode=a;break e}if(x=65535&g,p&=15,w<p&&(u+=R[i++]<<w,w+=8,w<p&&(u+=R[i++]<<w,w+=8)),x+=u&(1<<p)-1,x>l){e.msg="invalid distance too far back",Z.mode=a;break e}if(u>>>=p,w-=p,p=r-o,x>p){if(p=x-p,p>f&&Z.sane){e.msg="invalid distance too far back",Z.mode=a;break e}if(y=0,E=h,0===c){if(y+=d-p,p<v){v-=p;do{A[r++]=h[y++]}while(--p);y=r-x,E=A}}else if(c<p){if(y+=d+c-p,p-=c,p<v){v-=p;do{A[r++]=h[y++]}while(--p);if(y=0,c<v){p=c,v-=p;do{A[r++]=h[y++]}while(--p);y=r-x,E=A}}}else if(y+=c-p,p<v){v-=p;do{A[r++]=h[y++]}while(--p);y=r-x,E=A}for(;v>2;)A[r++]=E[y++],A[r++]=E[y++],A[r++]=E[y++],v-=3;v&&(A[r++]=E[y++],v>1&&(A[r++]=E[y++]))}else{y=r-x;do{A[r++]=A[y++],A[r++]=A[y++],A[r++]=A[y++],v-=3}while(v>2);v&&(A[r++]=A[y++],v>1&&(A[r++]=A[y++]))}break}}break}}while(i<n&&r<s);v=w>>3,i-=v,w-=v<<3,u&=(1<<w)-1,e.next_in=i,e.next_out=r,e.avail_in=i<n?n-i+5:5-(i-n),e.avail_out=r<s?s-r+257:257-(r-s),Z.hold=u,Z.bits=w};const o=15,s=new Uint16Array([3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0]),l=new Uint8Array([16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78]),d=new Uint16Array([1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0]),f=new Uint8Array([16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64]);var c=(e,t,i,n,a,r,c,h)=>{const u=h.bits;let w,b,m,k,_,g,p=0,v=0,x=0,y=0,E=0,R=0,A=0,Z=0,S=0,T=0,O=null;const U=new Uint16Array(16),D=new Uint16Array(16);let I,B,N,C=null;for(p=0;p<=o;p++)U[p]=0;for(v=0;v<n;v++)U[t[i+v]]++;for(E=u,y=o;y>=1&&0===U[y];y--);if(E>y&&(E=y),0===y)return a[r++]=20971520,a[r++]=20971520,h.bits=1,0;for(x=1;x<y&&0===U[x];x++);for(E<x&&(E=x),Z=1,p=1;p<=o;p++)if(Z<<=1,Z-=U[p],Z<0)return-1;if(Z>0&&(0===e||1!==y))return-1;for(D[1]=0,p=1;p<o;p++)D[p+1]=D[p]+U[p];for(v=0;v<n;v++)0!==t[i+v]&&(c[D[t[i+v]]++]=v);if(0===e?(O=C=c,g=20):1===e?(O=s,C=l,g=257):(O=d,C=f,g=0),T=0,v=0,p=x,_=r,R=E,A=0,m=-1,S=1<<E,k=S-1,1===e&&S>852||2===e&&S>592)return 1;for(;;){I=p-A,c[v]+1<g?(B=0,N=c[v]):c[v]>=g?(B=C[c[v]-g],N=O[c[v]-g]):(B=96,N=0),w=1<<p-A,b=1<<R,x=b;do{b-=w,a[_+(T>>A)+b]=I<<24|B<<16|N|0}while(0!==b);for(w=1<<p-1;T&w;)w>>=1;if(0!==w?(T&=w-1,T+=w):T=0,v++,0==--U[p]){if(p===y)break;p=t[i+c[v]]}if(p>E&&(T&k)!==m){for(0===A&&(A=E),_+=x,R=p-A,Z=1<<R;R+A<y&&(Z-=U[R+A],!(Z<=0));)R++,Z<<=1;if(S+=1<<R,1===e&&S>852||2===e&&S>592)return 1;m=T&k,a[m]=E<<24|R<<16|_-r|0}}return 0!==T&&(a[_+T]=p-A<<24|64<<16|0),h.bits=E,0},h={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_MEM_ERROR:-4,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8};const{Z_FINISH:u,Z_BLOCK:w,Z_TREES:b,Z_OK:m,Z_STREAM_END:k,Z_NEED_DICT:_,Z_STREAM_ERROR:g,Z_DATA_ERROR:p,Z_MEM_ERROR:v,Z_BUF_ERROR:x,Z_DEFLATED:y}=h,E=16180,R=16190,A=16191,Z=16192,S=16194,T=16199,O=16200,U=16206,D=16209,I=e=>(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24);function B(){this.strm=null,this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new Uint16Array(320),this.work=new Uint16Array(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}const N=e=>{if(!e)return 1;const t=e.state;return!t||t.strm!==e||t.mode<E||t.mode>16211?1:0},C=e=>{if(N(e))return g;const t=e.state;return e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=E,t.last=0,t.havedict=0,t.flags=-1,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new Int32Array(852),t.distcode=t.distdyn=new Int32Array(592),t.sane=1,t.back=-1,m},z=e=>{if(N(e))return g;const t=e.state;return t.wsize=0,t.whave=0,t.wnext=0,C(e)},F=(e,t)=>{let i;if(N(e))return g;const n=e.state;return t<0?(i=0,t=-t):(i=5+(t>>4),t<48&&(t&=15)),t&&(t<8||t>15)?g:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=i,n.wbits=t,z(e))},L=(e,t)=>{if(!e)return g;const i=new B;e.state=i,i.strm=e,i.window=null,i.mode=E;const n=F(e,t);return n!==m&&(e.state=null),n};let M,H,j=!0;const K=e=>{if(j){M=new Int32Array(512),H=new Int32Array(32);let t=0;for(;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(c(1,e.lens,0,288,M,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;c(2,e.lens,0,32,H,0,e.work,{bits:5}),j=!1}e.lencode=M,e.lenbits=9,e.distcode=H,e.distbits=5},P=(e,t,i,n)=>{let a;const r=e.state;return null===r.window&&(r.wsize=1<<r.wbits,r.wnext=0,r.whave=0,r.window=new Uint8Array(r.wsize)),n>=r.wsize?(r.window.set(t.subarray(i-r.wsize,i),0),r.wnext=0,r.whave=r.wsize):(a=r.wsize-r.wnext,a>n&&(a=n),r.window.set(t.subarray(i-n,i-n+a),r.wnext),(n-=a)?(r.window.set(t.subarray(i-n,i),0),r.wnext=n,r.whave=r.wsize):(r.wnext+=a,r.wnext===r.wsize&&(r.wnext=0),r.whave<r.wsize&&(r.whave+=a))),0};var Y={inflateReset:z,inflateReset2:F,inflateResetKeep:C,inflateInit:e=>L(e,15),inflateInit2:L,inflate:(e,i)=>{let a,o,s,l,d,f,h,B,C,z,F,L,M,H,j,Y,G,X,W,q,J,Q,V=0;const $=new Uint8Array(4);let ee,te;const ie=new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]);if(N(e)||!e.output||!e.input&&0!==e.avail_in)return g;a=e.state,a.mode===A&&(a.mode=Z),d=e.next_out,s=e.output,h=e.avail_out,l=e.next_in,o=e.input,f=e.avail_in,B=a.hold,C=a.bits,z=f,F=h,Q=m;e:for(;;)switch(a.mode){case E:if(0===a.wrap){a.mode=Z;break}for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(2&a.wrap&&35615===B){0===a.wbits&&(a.wbits=15),a.check=0,$[0]=255&B,$[1]=B>>>8&255,a.check=n(a.check,$,2,0),B=0,C=0,a.mode=16181;break}if(a.head&&(a.head.done=!1),!(1&a.wrap)||(((255&B)<<8)+(B>>8))%31){e.msg="incorrect header check",a.mode=D;break}if((15&B)!==y){e.msg="unknown compression method",a.mode=D;break}if(B>>>=4,C-=4,J=8+(15&B),0===a.wbits&&(a.wbits=J),J>15||J>a.wbits){e.msg="invalid window size",a.mode=D;break}a.dmax=1<<a.wbits,a.flags=0,e.adler=a.check=1,a.mode=512&B?16189:A,B=0,C=0;break;case 16181:for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(a.flags=B,(255&a.flags)!==y){e.msg="unknown compression method",a.mode=D;break}if(57344&a.flags){e.msg="unknown header flags set",a.mode=D;break}a.head&&(a.head.text=B>>8&1),512&a.flags&&4&a.wrap&&($[0]=255&B,$[1]=B>>>8&255,a.check=n(a.check,$,2,0)),B=0,C=0,a.mode=16182;case 16182:for(;C<32;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.head&&(a.head.time=B),512&a.flags&&4&a.wrap&&($[0]=255&B,$[1]=B>>>8&255,$[2]=B>>>16&255,$[3]=B>>>24&255,a.check=n(a.check,$,4,0)),B=0,C=0,a.mode=16183;case 16183:for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.head&&(a.head.xflags=255&B,a.head.os=B>>8),512&a.flags&&4&a.wrap&&($[0]=255&B,$[1]=B>>>8&255,a.check=n(a.check,$,2,0)),B=0,C=0,a.mode=16184;case 16184:if(1024&a.flags){for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.length=B,a.head&&(a.head.extra_len=B),512&a.flags&&4&a.wrap&&($[0]=255&B,$[1]=B>>>8&255,a.check=n(a.check,$,2,0)),B=0,C=0}else a.head&&(a.head.extra=null);a.mode=16185;case 16185:if(1024&a.flags&&(L=a.length,L>f&&(L=f),L&&(a.head&&(J=a.head.extra_len-a.length,a.head.extra||(a.head.extra=new Uint8Array(a.head.extra_len)),a.head.extra.set(o.subarray(l,l+L),J)),512&a.flags&&4&a.wrap&&(a.check=n(a.check,o,L,l)),f-=L,l+=L,a.length-=L),a.length))break e;a.length=0,a.mode=16186;case 16186:if(2048&a.flags){if(0===f)break e;L=0;do{J=o[l+L++],a.head&&J&&a.length<65536&&(a.head.name+=String.fromCharCode(J))}while(J&&L<f);if(512&a.flags&&4&a.wrap&&(a.check=n(a.check,o,L,l)),f-=L,l+=L,J)break e}else a.head&&(a.head.name=null);a.length=0,a.mode=16187;case 16187:if(4096&a.flags){if(0===f)break e;L=0;do{J=o[l+L++],a.head&&J&&a.length<65536&&(a.head.comment+=String.fromCharCode(J))}while(J&&L<f);if(512&a.flags&&4&a.wrap&&(a.check=n(a.check,o,L,l)),f-=L,l+=L,J)break e}else a.head&&(a.head.comment=null);a.mode=16188;case 16188:if(512&a.flags){for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(4&a.wrap&&B!==(65535&a.check)){e.msg="header crc mismatch",a.mode=D;break}B=0,C=0}a.head&&(a.head.hcrc=a.flags>>9&1,a.head.done=!0),e.adler=a.check=0,a.mode=A;break;case 16189:for(;C<32;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}e.adler=a.check=I(B),B=0,C=0,a.mode=R;case R:if(0===a.havedict)return e.next_out=d,e.avail_out=h,e.next_in=l,e.avail_in=f,a.hold=B,a.bits=C,_;e.adler=a.check=1,a.mode=A;case A:if(i===w||i===b)break e;case Z:if(a.last){B>>>=7&C,C-=7&C,a.mode=U;break}for(;C<3;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}switch(a.last=1&B,B>>>=1,C-=1,3&B){case 0:a.mode=16193;break;case 1:if(K(a),a.mode=T,i===b){B>>>=2,C-=2;break e}break;case 2:a.mode=16196;break;case 3:e.msg="invalid block type",a.mode=D}B>>>=2,C-=2;break;case 16193:for(B>>>=7&C,C-=7&C;C<32;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if((65535&B)!=(B>>>16^65535)){e.msg="invalid stored block lengths",a.mode=D;break}if(a.length=65535&B,B=0,C=0,a.mode=S,i===b)break e;case S:a.mode=16195;case 16195:if(L=a.length,L){if(L>f&&(L=f),L>h&&(L=h),0===L)break e;s.set(o.subarray(l,l+L),d),f-=L,l+=L,h-=L,d+=L,a.length-=L;break}a.mode=A;break;case 16196:for(;C<14;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(a.nlen=257+(31&B),B>>>=5,C-=5,a.ndist=1+(31&B),B>>>=5,C-=5,a.ncode=4+(15&B),B>>>=4,C-=4,a.nlen>286||a.ndist>30){e.msg="too many length or distance symbols",a.mode=D;break}a.have=0,a.mode=16197;case 16197:for(;a.have<a.ncode;){for(;C<3;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.lens[ie[a.have++]]=7&B,B>>>=3,C-=3}for(;a.have<19;)a.lens[ie[a.have++]]=0;if(a.lencode=a.lendyn,a.lenbits=7,ee={bits:a.lenbits},Q=c(0,a.lens,0,19,a.lencode,0,a.work,ee),a.lenbits=ee.bits,Q){e.msg="invalid code lengths set",a.mode=D;break}a.have=0,a.mode=16198;case 16198:for(;a.have<a.nlen+a.ndist;){for(;V=a.lencode[B&(1<<a.lenbits)-1],j=V>>>24,Y=V>>>16&255,G=65535&V,!(j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(G<16)B>>>=j,C-=j,a.lens[a.have++]=G;else{if(16===G){for(te=j+2;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(B>>>=j,C-=j,0===a.have){e.msg="invalid bit length repeat",a.mode=D;break}J=a.lens[a.have-1],L=3+(3&B),B>>>=2,C-=2}else if(17===G){for(te=j+3;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}B>>>=j,C-=j,J=0,L=3+(7&B),B>>>=3,C-=3}else{for(te=j+7;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}B>>>=j,C-=j,J=0,L=11+(127&B),B>>>=7,C-=7}if(a.have+L>a.nlen+a.ndist){e.msg="invalid bit length repeat",a.mode=D;break}for(;L--;)a.lens[a.have++]=J}}if(a.mode===D)break;if(0===a.lens[256]){e.msg="invalid code -- missing end-of-block",a.mode=D;break}if(a.lenbits=9,ee={bits:a.lenbits},Q=c(1,a.lens,0,a.nlen,a.lencode,0,a.work,ee),a.lenbits=ee.bits,Q){e.msg="invalid literal/lengths set",a.mode=D;break}if(a.distbits=6,a.distcode=a.distdyn,ee={bits:a.distbits},Q=c(2,a.lens,a.nlen,a.ndist,a.distcode,0,a.work,ee),a.distbits=ee.bits,Q){e.msg="invalid distances set",a.mode=D;break}if(a.mode=T,i===b)break e;case T:a.mode=O;case O:if(f>=6&&h>=258){e.next_out=d,e.avail_out=h,e.next_in=l,e.avail_in=f,a.hold=B,a.bits=C,r(e,F),d=e.next_out,s=e.output,h=e.avail_out,l=e.next_in,o=e.input,f=e.avail_in,B=a.hold,C=a.bits,a.mode===A&&(a.back=-1);break}for(a.back=0;V=a.lencode[B&(1<<a.lenbits)-1],j=V>>>24,Y=V>>>16&255,G=65535&V,!(j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(Y&&0==(240&Y)){for(X=j,W=Y,q=G;V=a.lencode[q+((B&(1<<X+W)-1)>>X)],j=V>>>24,Y=V>>>16&255,G=65535&V,!(X+j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}B>>>=X,C-=X,a.back+=X}if(B>>>=j,C-=j,a.back+=j,a.length=G,0===Y){a.mode=16205;break}if(32&Y){a.back=-1,a.mode=A;break}if(64&Y){e.msg="invalid literal/length code",a.mode=D;break}a.extra=15&Y,a.mode=16201;case 16201:if(a.extra){for(te=a.extra;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.length+=B&(1<<a.extra)-1,B>>>=a.extra,C-=a.extra,a.back+=a.extra}a.was=a.length,a.mode=16202;case 16202:for(;V=a.distcode[B&(1<<a.distbits)-1],j=V>>>24,Y=V>>>16&255,G=65535&V,!(j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(0==(240&Y)){for(X=j,W=Y,q=G;V=a.distcode[q+((B&(1<<X+W)-1)>>X)],j=V>>>24,Y=V>>>16&255,G=65535&V,!(X+j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}B>>>=X,C-=X,a.back+=X}if(B>>>=j,C-=j,a.back+=j,64&Y){e.msg="invalid distance code",a.mode=D;break}a.offset=G,a.extra=15&Y,a.mode=16203;case 16203:if(a.extra){for(te=a.extra;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.offset+=B&(1<<a.extra)-1,B>>>=a.extra,C-=a.extra,a.back+=a.extra}if(a.offset>a.dmax){e.msg="invalid distance too far back",a.mode=D;break}a.mode=16204;case 16204:if(0===h)break e;if(L=F-h,a.offset>L){if(L=a.offset-L,L>a.whave&&a.sane){e.msg="invalid distance too far back",a.mode=D;break}L>a.wnext?(L-=a.wnext,M=a.wsize-L):M=a.wnext-L,L>a.length&&(L=a.length),H=a.window}else H=s,M=d-a.offset,L=a.length;L>h&&(L=h),h-=L,a.length-=L;do{s[d++]=H[M++]}while(--L);0===a.length&&(a.mode=O);break;case 16205:if(0===h)break e;s[d++]=a.length,h--,a.mode=O;break;case U:if(a.wrap){for(;C<32;){if(0===f)break e;f--,B|=o[l++]<<C,C+=8}if(F-=h,e.total_out+=F,a.total+=F,4&a.wrap&&F&&(e.adler=a.check=a.flags?n(a.check,s,F,d-F):t(a.check,s,F,d-F)),F=h,4&a.wrap&&(a.flags?B:I(B))!==a.check){e.msg="incorrect data check",a.mode=D;break}B=0,C=0}a.mode=16207;case 16207:if(a.wrap&&a.flags){for(;C<32;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(4&a.wrap&&B!==(4294967295&a.total)){e.msg="incorrect length check",a.mode=D;break}B=0,C=0}a.mode=16208;case 16208:Q=k;break e;case D:Q=p;break e;case 16210:return v;default:return g}return e.next_out=d,e.avail_out=h,e.next_in=l,e.avail_in=f,a.hold=B,a.bits=C,(a.wsize||F!==e.avail_out&&a.mode<D&&(a.mode<U||i!==u))&&P(e,e.output,e.next_out,F-e.avail_out),z-=e.avail_in,F-=e.avail_out,e.total_in+=z,e.total_out+=F,a.total+=F,4&a.wrap&&F&&(e.adler=a.check=a.flags?n(a.check,s,F,e.next_out-F):t(a.check,s,F,e.next_out-F)),e.data_type=a.bits+(a.last?64:0)+(a.mode===A?128:0)+(a.mode===T||a.mode===S?256:0),(0===z&&0===F||i===u)&&Q===m&&(Q=x),Q},inflateEnd:e=>{if(N(e))return g;let t=e.state;return t.window&&(t.window=null),e.state=null,m},inflateGetHeader:(e,t)=>{if(N(e))return g;const i=e.state;return 0==(2&i.wrap)?g:(i.head=t,t.done=!1,m)},inflateSetDictionary:(e,i)=>{const n=i.length;let a,r,o;return N(e)?g:(a=e.state,0!==a.wrap&&a.mode!==R?g:a.mode===R&&(r=1,r=t(r,i,n,0),r!==a.check)?p:(o=P(e,i,n,n),o?(a.mode=16210,v):(a.havedict=1,m)))},inflateInfo:"pako inflate (from Nodeca project)"};const G=(e,t)=>Object.prototype.hasOwnProperty.call(e,t);var X=function(e){const t=Array.prototype.slice.call(arguments,1);for(;t.length;){const i=t.shift();if(i){if("object"!=typeof i)throw new TypeError(i+"must be non-object");for(const t in i)G(i,t)&&(e[t]=i[t])}}return e},W=e=>{let t=0;for(let i=0,n=e.length;i<n;i++)t+=e[i].length;const i=new Uint8Array(t);for(let t=0,n=0,a=e.length;t<a;t++){let a=e[t];i.set(a,n),n+=a.length}return i};let q=!0;try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){q=!1}const J=new Uint8Array(256);for(let e=0;e<256;e++)J[e]=e>=252?6:e>=248?5:e>=240?4:e>=224?3:e>=192?2:1;J[254]=J[254]=1;var Q=e=>{if("function"==typeof TextEncoder&&TextEncoder.prototype.encode)return(new TextEncoder).encode(e);let t,i,n,a,r,o=e.length,s=0;for(a=0;a<o;a++)i=e.charCodeAt(a),55296==(64512&i)&&a+1<o&&(n=e.charCodeAt(a+1),56320==(64512&n)&&(i=65536+(i-55296<<10)+(n-56320),a++)),s+=i<128?1:i<2048?2:i<65536?3:4;for(t=new Uint8Array(s),r=0,a=0;r<s;a++)i=e.charCodeAt(a),55296==(64512&i)&&a+1<o&&(n=e.charCodeAt(a+1),56320==(64512&n)&&(i=65536+(i-55296<<10)+(n-56320),a++)),i<128?t[r++]=i:i<2048?(t[r++]=192|i>>>6,t[r++]=128|63&i):i<65536?(t[r++]=224|i>>>12,t[r++]=128|i>>>6&63,t[r++]=128|63&i):(t[r++]=240|i>>>18,t[r++]=128|i>>>12&63,t[r++]=128|i>>>6&63,t[r++]=128|63&i);return t},V=(e,t)=>{const i=t||e.length;if("function"==typeof TextDecoder&&TextDecoder.prototype.decode)return(new TextDecoder).decode(e.subarray(0,t));let n,a;const r=new Array(2*i);for(a=0,n=0;n<i;){let t=e[n++];if(t<128){r[a++]=t;continue}let o=J[t];if(o>4)r[a++]=65533,n+=o-1;else{for(t&=2===o?31:3===o?15:7;o>1&&n<i;)t=t<<6|63&e[n++],o--;o>1?r[a++]=65533:t<65536?r[a++]=t:(t-=65536,r[a++]=55296|t>>10&1023,r[a++]=56320|1023&t)}}return((e,t)=>{if(t<65534&&e.subarray&&q)return String.fromCharCode.apply(null,e.length===t?e:e.subarray(0,t));let i="";for(let n=0;n<t;n++)i+=String.fromCharCode(e[n]);return i})(r,a)},$=(e,t)=>{(t=t||e.length)>e.length&&(t=e.length);let i=t-1;for(;i>=0&&128==(192&e[i]);)i--;return i<0||0===i?t:i+J[e[i]]>t?i:t},ee={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"};var te=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0};var ie=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1};const ne=Object.prototype.toString,{Z_NO_FLUSH:ae,Z_FINISH:re,Z_OK:oe,Z_STREAM_END:se,Z_NEED_DICT:le,Z_STREAM_ERROR:de,Z_DATA_ERROR:fe,Z_MEM_ERROR:ce}=h;function he(e){this.options=X({chunkSize:65536,windowBits:15,to:""},e||{});const t=this.options;t.raw&&t.windowBits>=0&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(t.windowBits>=0&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),t.windowBits>15&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new te,this.strm.avail_out=0;let i=Y.inflateInit2(this.strm,t.windowBits);if(i!==oe)throw new Error(ee[i]);if(this.header=new ie,Y.inflateGetHeader(this.strm,this.header),t.dictionary&&("string"==typeof t.dictionary?t.dictionary=Q(t.dictionary):"[object ArrayBuffer]"===ne.call(t.dictionary)&&(t.dictionary=new Uint8Array(t.dictionary)),t.raw&&(i=Y.inflateSetDictionary(this.strm,t.dictionary),i!==oe)))throw new Error(ee[i])}function ue(e,t){const i=new he(t);if(i.push(e),i.err)throw i.msg||ee[i.err];return i.result}he.prototype.push=function(e,t){const i=this.strm,n=this.options.chunkSize,a=this.options.dictionary;let r,o,s;if(this.ended)return!1;for(o=t===~~t?t:!0===t?re:ae,"[object ArrayBuffer]"===ne.call(e)?i.input=new Uint8Array(e):i.input=e,i.next_in=0,i.avail_in=i.input.length;;){for(0===i.avail_out&&(i.output=new Uint8Array(n),i.next_out=0,i.avail_out=n),r=Y.inflate(i,o),r===le&&a&&(r=Y.inflateSetDictionary(i,a),r===oe?r=Y.inflate(i,o):r===fe&&(r=le));i.avail_in>0&&r===se&&i.state.wrap>0&&0!==e[i.next_in];)Y.inflateReset(i),r=Y.inflate(i,o);switch(r){case de:case fe:case le:case ce:return this.onEnd(r),this.ended=!0,!1}if(s=i.avail_out,i.next_out&&(0===i.avail_out||r===se))if("string"===this.options.to){let e=$(i.output,i.next_out),t=i.next_out-e,a=V(i.output,e);i.next_out=t,i.avail_out=n-t,t&&i.output.set(i.output.subarray(e,e+t),0),this.onData(a)}else this.onData(i.output.length===i.next_out?i.output:i.output.subarray(0,i.next_out));if(r!==oe||0!==s){if(r===se)return r=Y.inflateEnd(this.strm),this.onEnd(r),this.ended=!0,!0;if(0===i.avail_in)break}}return!0},he.prototype.onData=function(e){this.chunks.push(e)},he.prototype.onEnd=function(e){e===oe&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=W(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg};var we=he,be=ue,me=function(e,t){return(t=t||{}).raw=!0,ue(e,t)},ke=ue,_e=h,ge={Inflate:we,inflate:be,inflateRaw:me,ungzip:ke,constants:_e};e.Inflate=we,e.constants=_e,e.default=ge,e.inflate=be,e.inflateRaw=me,e.ungzip=ke,Object.defineProperty(e,"__esModule",{value:!0})}));

return module.exports; })();

// Engine-neutral, Godot-compatible affine coordinates: x right, y down, radians.
const Math2D = (() => {
    const identity = () => [1, 0, 0, 1, 0, 0];
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smoothstep = (a, b, x) => {
        const t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    };
    const transform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const basis = (m, x, y) => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
    const multiply = (a, b) => [
        a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    const inverse = (m) => {
        const d = m[0] * m[3] - m[1] * m[2];
        if (!Number.isFinite(d) || Math.abs(d) < 1e-12) throw new Error('Singular 2D transform');
        const a = m[3] / d, b = -m[1] / d, c = -m[2] / d, e = m[0] / d;
        return [a, b, c, e, -a * m[4] - c * m[5], -b * m[4] - e * m[5]];
    };
    const trs = (position = [0, 0], rotation = 0, scale = [1, 1]) => {
        const c = Math.cos(rotation), s = Math.sin(rotation);
        return [c * scale[0], s * scale[0], -s * scale[1], c * scale[1], position[0], position[1]];
    };
    return Object.freeze({identity, clamp, smoothstep, transform, basis, multiply, inverse, trs});
})();

class BoneRig {
    constructor(bones) {
        this.bones = bones.map((bone, i) => {
            if (bone.parent >= i || bone.parent < -1) throw new Error('Bones must be parent-first');
            return Object.assign({}, bone, {
                position: [...(bone.position || [0, 0])], rotation: bone.rotation || 0, scale: [...(bone.scale || [1, 1])],
                restPosition: [...(bone.position || [0, 0])], restRotation: bone.rotation || 0, restScale: [...(bone.scale || [1, 1])],
            });
        });
        this.byName = new Map(this.bones.map((b, i) => [b.name, i]));
        this.world = [];
        this.update();
        this.rest = this.world.map(m => [...m]);
        this.inverseRest = this.rest.map(Math2D.inverse);
    }
    reset() {
        for (const b of this.bones) {
            b.position = [...(b.restPosition || [0, 0])];
            b.scale = [...(b.restScale || [1, 1])];
            b.rotation = b.restRotation || 0;
        }
        this.update();
    }
    update() {
        for (let i = 0; i < this.bones.length; ++i) {
            const b = this.bones[i];
            const local = Math2D.trs(b.position, b.rotation, b.scale);
            this.world[i] = b.parent < 0 ? local : Math2D.multiply(this.world[b.parent], local);
        }
        return this.world;
    }
    skinMatrices() { return this.world.map((m, i) => Math2D.multiply(m, this.inverseRest[i])); }
}

function sampleTrack(track, time) {
    const n = track.times.length;
    if (!n || n !== track.values.length) throw new Error('Invalid animation track');
    if (time <= track.times[0]) return track.values[0];
    if (time >= track.times[n - 1]) return track.values[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (track.times[mid] <= time) lo = mid; else hi = mid; }
    const a = track.values[lo], b = track.values[hi];
    if (track.update === 1 || typeof a === 'boolean' || track.interpolation === 0) return a;
    const f = (time - track.times[lo]) / (track.times[hi] - track.times[lo]);
    return Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * f) : a + (b - a) * f;
}

function createGrid(rect, cell) {
    if (!(cell > 0) || rect[2] <= 0 || rect[3] <= 0) throw new Error('Invalid grid bounds');
    const columns = Math.max(2, Math.ceil(rect[2] / cell));
    const rows = Math.max(2, Math.ceil(rect[3] / cell));
    const count = (columns + 1) * (rows + 1);
    if (count > 65535) throw new Error('Grid exceeds 16-bit UI renderer capacity');
    const source = new Float32Array(count * 2), indices = new Uint16Array(columns * rows * 6);
    let p = 0, t = 0;
    for (let y = 0; y <= rows; ++y) for (let x = 0; x <= columns; ++x) {
        source[p++] = rect[0] + rect[2] * x / columns;
        source[p++] = rect[1] + rect[3] * y / rows;
    }
    for (let y = 0; y < rows; ++y) for (let x = 0; x < columns; ++x) {
        const i = y * (columns + 1) + x;
        indices[t++] = i; indices[t++] = i + 1; indices[t++] = i + columns + 2;
        indices[t++] = i; indices[t++] = i + columns + 2; indices[t++] = i + columns + 1;
    }
    return {rect: [...rect], columns, rows, source, vertices: new Float32Array(source), indices};
}

function weightedSkin(source, weights, matrices, output = new Float32Array(source.length)) {
    if (weights.length !== source.length / 2 * matrices.length) throw new Error('Skin weight count mismatch');
    for (let i = 0; i < source.length / 2; ++i) {
        let x = 0, y = 0, sum = 0;
        for (let b = 0; b < matrices.length; ++b) {
            const w = weights[i * matrices.length + b];
            if (!Number.isFinite(w) || w < 0) throw new Error('Invalid skin weight');
            if (!w) continue;
            const m = matrices[b];
            x += (m[0] * source[i * 2] + m[2] * source[i * 2 + 1] + m[4]) * w;
            y += (m[1] * source[i * 2] + m[3] * source[i * 2 + 1] + m[5]) * w;
            sum += w;
        }
        if (Math.abs(sum - 1) > 1e-4) throw new Error('Skin weights must sum to one');
        output[i * 2] = x; output[i * 2 + 1] = y;
    }
    return output;
}

function sourcePixelAt(mesh, point) {
    const vertices = mesh.vertices, source = mesh.source, triangles = mesh.indices;
    for (let i = 0; i < triangles.length; i += 3) {
        const a = triangles[i] * 2, b = triangles[i + 1] * 2, c = triangles[i + 2] * 2;
        const abx = vertices[b] - vertices[a], aby = vertices[b + 1] - vertices[a + 1];
        const acx = vertices[c] - vertices[a], acy = vertices[c + 1] - vertices[a + 1];
        const d = abx * acy - aby * acx;
        if (Math.abs(d) < 1e-6) continue;
        const px = point[0] - vertices[a], py = point[1] - vertices[a + 1];
        const u = (px * acy - py * acx) / d, v = (abx * py - aby * px) / d;
        if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) return [
            source[a] * (1 - u - v) + source[b] * u + source[c] * v,
            source[a + 1] * (1 - u - v) + source[b + 1] * u + source[c + 1] * v,
        ];
    }
    return null;
}

// Forward sampling of the same two-triangle grid, used by anchors and casts.
function renderedPointAt(mesh, point) {
    const fx=(point[0]-mesh.rect[0])/mesh.rect[2]*mesh.columns,fy=(point[1]-mesh.rect[1])/mesh.rect[3]*mesh.rows;
    const x=Math2D.clamp(Math.floor(fx),0,mesh.columns-1),y=Math2D.clamp(Math.floor(fy),0,mesh.rows-1),u=fx-x,v=fy-y,i=y*(mesh.columns+1)+x;
    const indices=v<=u?[i,i+1,i+mesh.columns+2]:[i,i+mesh.columns+2,i+mesh.columns+1],weights=v<=u?[1-u,u-v,v]:[1-v,u,v-u];
    return [0,1].map(axis=>indices.reduce((sum,index,j)=>sum+mesh.vertices[index*2+axis]*weights[j],0));
}

Object.assign(api, {Math2D, BoneRig, sampleTrack, createGrid, weightedSkin, sourcePixelAt, renderedPointAt});

// Every page/request owns a scope. Late continuations cannot revive disposed pages.
class Lifetime {
    constructor(parent) {
        this.active = true;
        this.disposers = [];
        this.parent = parent || null;
        this.parentDisposer = parent ? () => this.dispose() : null;
        if (parent) parent.own(this.parentDisposer);
    }
    own(dispose) {
        if (!this.active) dispose();
        else this.disposers.push(dispose);
        return dispose;
    }
    // Remove ownership without running cleanup. A completed request must not
    // remain reachable through the long-lived application or cached page.
    disown(dispose) {
        const index = this.disposers.lastIndexOf(dispose);
        if (index < 0) return false;
        this.disposers.splice(index, 1);
        return true;
    }
    async guard(promise, lateDispose) {
        const value = await promise;
        if (!this.active) {
            if (lateDispose) lateDispose(value);
            throw new CancelledError();
        }
        return value;
    }
    dispose() {
        if (!this.active) return;
        this.active = false;
        if (this.parent) this.parent.disown(this.parentDisposer);
        this.parent = null;
        this.parentDisposer = null;
        const errors = [];
        for (const dispose of this.disposers.splice(0).reverse()) {
            try { dispose(); } catch (e) { errors.push(e); }
        }
        if (errors.length) throw new Error(`Lifetime cleanup failed: ${errors.map(e => e.message).join('; ')}`);
    }
}
class CancelledError extends Error { constructor() { super('Request cancelled'); this.name = 'CancelledError'; } }
Object.assign(api, {Lifetime, CancelledError});

class ResourceGate {
    constructor({maxSpecs = 80, maxEntries = 128, maxBytes = 256 * 1024 * 1024} = {}) {
        this.maxSpecs = maxSpecs; this.maxEntries = maxEntries; this.maxBytes = maxBytes;
        this.entries = new Map(); this.reservedBytes = 0;
    }
    async acquire(specs, load, unload, scope) {
        if (!scope.active) throw new CancelledError();
        const unique = new Map();
        for (const spec of specs) {
            if (!spec.key || !Number.isFinite(spec.bytes) || spec.bytes < 0) throw new Error('Resource requires a finite admission estimate');
            const existing = unique.get(spec.key) || this.entries.get(spec.key);
            if (existing && existing.bytes !== spec.bytes) throw new Error('Conflicting resource estimates');
            unique.set(spec.key, spec);
        }
        if (unique.size > this.maxSpecs) throw new Error('Resource batch exceeds 80-spec limit');
        const newSpecs = [...unique.values()].filter(s => !this.entries.has(s.key));
        if (this.entries.size + newSpecs.length > this.maxEntries || this.reservedBytes + newSpecs.reduce((sum, s) => sum + s.bytes, 0) > this.maxBytes) throw new Error('Resource admission budget exceeded');
        const owned = [];
        for (const spec of unique.values()) {
            let entry = this.entries.get(spec.key);
            if (!entry) {
                entry = {key: spec.key, bytes: spec.bytes, refs: 0, settled: false, value: null, unload};
                this.entries.set(spec.key, entry); this.reservedBytes += spec.bytes;
                entry.promise = Promise.resolve().then(() => load(spec)).then(value => {
                    entry.value = value; entry.settled = true; this.trim(entry); return value;
                }, error => { entry.settled = true; this.trim(entry); throw error; });
            }
            ++entry.refs; owned.push(entry);
        }
        const ready = Promise.all(owned.map(entry => entry.promise));
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            if (scope.disown) scope.disown(release);
            const errors = [];
            for (const entry of owned.splice(0)) {
                --entry.refs;
                try { this.trim(entry); } catch (error) { errors.push(error); }
            }
            if (errors.length) throw new Error(`Resource cleanup failed: ${errors.map(e => e.message).join('; ')}`);
        };
        scope.own(release);
        try {
            await ready;
            if (!scope.active || released) throw new CancelledError();
            return {get: key => { if (released) throw new CancelledError(); const entry = owned.find(e => e.key === key); if (!entry) throw new Error('Resource not leased'); return entry.value; }, release,
                replace: (key, bytes, create, restore) => {
                    if (released || !scope.active) throw new CancelledError();
                    const entry = owned.find(e => e.key === key);
                    if (!entry || !entry.settled || entry.refs !== 1) throw new Error('Replacement requires an exclusively leased resource');
                    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid replacement resource estimate');
                    const previous = entry.bytes, difference = bytes - previous;
                    if (this.reservedBytes + difference > this.maxBytes) throw new Error('Resource admission budget exceeded');
                    // Synchronous, exclusive replacement. Free the old allocation
                    // before creating the new one so peak admission stays bounded.
                    this.reservedBytes += difference; entry.bytes = bytes;
                    const old = entry.value; entry.value = null;
                    try {if (old != null) entry.unload(old); entry.value = create();}
                    catch (error) {
                        this.reservedBytes -= difference; entry.bytes = previous;
                        entry.value = restore();
                        throw error;
                    }
                },
            };
        } catch (error) { release(); throw error; }
    }
    trim(entry) {
        if (entry.refs || !entry.settled || this.entries.get(entry.key) !== entry) return;
        this.entries.delete(entry.key); this.reservedBytes -= entry.bytes;
        if (entry.value != null) entry.unload(entry.value);
    }
    snapshot() { return {entries: this.entries.size, reservedBytes: this.reservedBytes, pending: [...this.entries.values()].filter(e => !e.settled).length}; }
}
Object.assign(api, {ResourceGate});

// Isolate Creator 3.8.8's UI assembler hooks here. Public cc is passed by Boot.
// No DOM, browser globals, Spine, MeshRenderer or 3D module is required.
let registeredMeshSprite = null;
function registerCocos(cc) {
    if (registeredMeshSprite) return registeredMeshSprite;
    const assembler = {
        createData(sprite) {
            if (!sprite.mesh) return null;
            const rd = sprite.requestRenderData();
            rd.dataLength = sprite.mesh.source.length / 2;
            rd.resize(rd.dataLength, sprite.mesh.indices.length);
            rd.chunk.setIndexBuffer(sprite.mesh.indices);
            return rd;
        },
        updateRenderData(sprite) {
            const rd = sprite.renderData, frame = sprite.spriteFrame;
            if (!rd || !frame || !sprite.mesh) return;
            const data = rd.data, points = sprite.mesh.vertices;
            for (let i = 0; i < data.length; ++i) { data[i].x = points[i * 2]; data[i].y = -points[i * 2 + 1]; }
            this.updateUVs(sprite);
            this.updateColor(sprite);
            rd.updateRenderData(sprite, frame);
        },
        updateUVs(sprite) {
            const rd = sprite.renderData, frame = sprite.spriteFrame;
            if (!rd || !frame || !sprite.mesh) return;
            const uv = frame.uv, vb = rd.chunk.vb, points = sprite.mesh.source;
            const rect = sprite.sourceRect;
            for (let i = 0; i < rd.dataLength; ++i) {
                if (sprite.mesh.vertexUV) {
                    const offset = i * rd.floatStride;
                    vb[offset + 3] = sprite.mesh.vertexUV[i * 2];
                    vb[offset + 4] = sprite.mesh.vertexUV[i * 2 + 1];
                    continue;
                }
                const x = (points[i * 2] - rect[0]) / rect[2], y = (points[i * 2 + 1] - rect[1]) / rect[3], offset = i * rd.floatStride;
                // Bilinear frame UVs also preserve vertical texture conventions.
                vb[offset + 3] = (uv[4] + (uv[6] - uv[4]) * x) * (1 - y) + (uv[0] + (uv[2] - uv[0]) * x) * y;
                vb[offset + 4] = (uv[5] + (uv[7] - uv[5]) * x) * (1 - y) + (uv[1] + (uv[3] - uv[1]) * x) * y;
            }
        },
        updateColor(sprite) {
            const rd = sprite.renderData;
            if (!rd) return;
            const vb = rd.chunk.vb, c = sprite.color;
            const payload = sprite.mesh && sprite.mesh.vertexData;
            for (let i = 0; i < rd.dataLength; ++i) {
                const offset = i * rd.floatStride + 5;
                // Optional three-float payload for custom UI shaders. Alpha stays
                // under Creator's normal UIOpacity path (which overwrites alpha).
                // Values need not be colors: do not clamp or premultiply RGB.
                vb[offset] = payload ? payload[i * 3] : c.r / 255;
                vb[offset + 1] = payload ? payload[i * 3 + 1] : c.g / 255;
                vb[offset + 2] = payload ? payload[i * 3 + 2] : c.b / 255;
                vb[offset + 3] = c.a / 255;
            }
        },
        fillBuffers(sprite) {
            const rd = sprite.renderData;
            if (!rd || !sprite.mesh) return;
            const chunk = rd.chunk, vb = chunk.vb, m = sprite.node.worldMatrix, points = sprite.mesh.vertices;
            for (let i = 0; i < rd.dataLength; ++i) {
                const x = points[i * 2], y = -points[i * 2 + 1], o = i * rd.floatStride;
                const w = m.m03 * x + m.m07 * y + m.m15, rhw = w ? 1 / w : 1;
                vb[o] = (m.m00 * x + m.m04 * y + m.m12) * rhw;
                vb[o + 1] = (m.m01 * x + m.m05 * y + m.m13) * rhw;
                vb[o + 2] = (m.m02 * x + m.m06 * y + m.m14) * rhw;
            }
            rd.vertDirty = false;
            const buffer = chunk.meshBuffer, indices = sprite.mesh.indices;
            // StaticVBAccessor reserves vertices, but dense 2D meshes can use
            // more indices than its default four-per-vertex buffer. Match
            // Creator's appendIndices growth before writing; an overflow would
            // otherwise fail uploadBuffers and prevent the frame reset.
            const required = buffer.indexOffset + indices.length;
            if (buffer.iData.length < required) {
                const expanded = new Uint16Array(Math.ceil(required * 1.25));
                expanded.set(buffer.iData);
                buffer.iData = expanded;
            }
            let offset = buffer.indexOffset;
            for (let i = 0; i < indices.length; ++i) buffer.iData[offset++] = chunk.vertexOffset + indices[i];
            buffer.indexOffset += indices.length;
        },
    };
    class TravelMeshSprite extends cc.Sprite {
        constructor(...args) { super(...args); this.mesh = null; this.sourceRect = [0, 0, 1, 1]; }
        configure(mesh, sourceSize, contentRect = [0, 0, sourceSize[0], sourceSize[1]]) {
            if (!(mesh.vertices instanceof Float32Array) || mesh.vertices.length !== mesh.source.length) throw new Error('Invalid UI mesh');
            if (sourceSize.some(x => !(x > 0))) throw new Error('Invalid source dimensions');
            if (mesh.vertexData && (!(mesh.vertexData instanceof Float32Array) || mesh.vertexData.length !== mesh.source.length / 2 * 3 || mesh.vertexData.some(x => !Number.isFinite(x)))) throw new Error('Invalid UI vertex payload');
            if (mesh.vertexUV && (!(mesh.vertexUV instanceof Float32Array) || mesh.vertexUV.length !== mesh.source.length || mesh.vertexUV.some(x => !Number.isFinite(x)))) throw new Error('Invalid UI vertex UV');
            this.destroyRenderData();
            this.mesh = mesh; this.sourceRect = [...contentRect];
            this._flushAssembler();
        }
        geometryChanged() {
            if (this.renderData) this.renderData.vertDirty = true;
            this.markForUpdateRenderData();
        }
        _flushAssembler() {
            if (this._assembler !== assembler) { this.destroyRenderData(); this._assembler = assembler; }
            if (!this._renderData && this.mesh) {
                this._renderData = assembler.createData(this);
                this._renderData.material = this.getRenderMaterial(0);
                this.markForUpdateRenderData();
                if (this.spriteFrame) assembler.updateUVs(this);
                assembler.updateColor(this);
            }
        }
    }
    registeredMeshSprite = cc._decorator.ccclass('TravelMeshSprite')(TravelMeshSprite);
    return registeredMeshSprite;
}
Object.assign(api, {registerCocos});

// Shared UI geometry and pointer ownership. No game text or asset paths here.
function clipPolygonBelow(points, edge) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const insideA = a[1] <= edge, insideB = b[1] <= edge;
        if (insideA) out.push([...a]);
        if (insideA !== insideB) {
            const u = (edge - a[1]) / (b[1] - a[1]);
            out.push([a[0] + (b[0] - a[0]) * u, edge]);
        }
    }
    return out;
}
function paperBubbleContour(card, tip, above) {
    const [x, y, w, h] = card, points = [[x + 29, y + 6]];
    let cursor = [29, 6];
    const lerp = (a, b, t) => a + (b - a) * t;
    const curve = (a, b, end) => {
        const start = cursor;
        for (let i = 1; i <= 8; i++) {
            const t = i / 8, u = 1 - t;
            points.push([x + u*u*u*start[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t*t*t*end[0], y + u*u*u*start[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t*t*t*end[1]]);
        }
        cursor = end;
    };
    const tailX = Math2D.clamp(tip[0] - x, 58, w - 58), relative = [tip[0] - x, tip[1] - y];
    if (above && tip[1] < y - 2) {
        curve([lerp(cursor[0], tailX-10,.3),1],[lerp(cursor[0],tailX-10,.75),3],[tailX-10,3]);
        curve([tailX-8,-4],[relative[0]-4,relative[1]+6],relative);
        curve([relative[0]+7,relative[1]+3],[tailX+12,-5],[tailX+14,3]);
        curve([lerp(cursor[0],w-38,.3),1],[lerp(cursor[0],w-38,.75),3],[w-38,5]);
    } else curve([w*.24,-1],[w*.62,1],[w-38,5]);
    curve([w-10,6],[w+2,h*.23],[w-1,h*.52]);
    curve([w-2,h*.78],[w-12,h-4],[w-37,h-2]);
    if (!above && tip[1] > y+h+2) {
        curve([lerp(cursor[0],tailX+13,.45),h+1],[tailX+24,h-3],[tailX+13,h-2]);
        curve([tailX+12,h+9],[relative[0]+7,relative[1]-2],relative);
        curve([relative[0]-3,relative[1]-7],[tailX-4,h+3],[tailX-9,h-2]);
    }
    curve([lerp(cursor[0],27,.3),h-1],[lerp(cursor[0],27,.75),h+3],[27,h-4]);
    curve([5,h-8],[-2,h*.7],[0,h*.46]);
    curve([1,h*.19],[10,9],[29,6]);
    return points;
}
class SwingFeedback {
    constructor() {this.angle=-.026;this.velocity=0;this.clock=0;this.pressTime=1;this.scale=1;}
    press() {this.pressTime=0;this.velocity+=.12;this.scale=.955;}
    release() {this.pressTime=Math.max(this.pressTime,.075);}
    advance(delta) {
        if(!Number.isFinite(delta))return;
        this.pressTime=Math.min(1,this.pressTime+Math.max(delta,0));
        const phase=this.pressTime/.32;
        this.scale=this.pressTime<.32?1-.045*Math.cos(phase*Math.PI*1.4)*Math.exp(-phase*4):1;
        let remaining=Math2D.clamp(delta,0,.1);
        while(remaining>0){const step=Math.min(remaining,.016);this.clock+=step;const breeze=Math.sin(this.clock*.8)*.009;this.velocity+=(-18*(this.angle-breeze)-4.5*this.velocity)*step;this.angle=Math2D.clamp(this.angle+this.velocity*step,-.045,.045);remaining-=step;}
    }
}
// Captures one modal target. Leaving it cancels permanently, including an
// outside press crossing the paper and returning outside before release.
class BubblePointer {
    constructor(){this.cancel();}
    cancel(){this.owner=null;this.target='';this.valid=false;this.rect=[];}
    down(id,at,card,choices,phase){if(this.owner!==null)return true;this.owner=id;this.target=this.targetAt(at,card,choices);if(phase==='closing'||phase!=='hold'&&this.target!=='outside'&&this.target!=='no')this.target='';this.valid=!!this.target;this.rect=(choices[this.target]||[]).slice();return true;}
    move(id,at,card){if(id!==this.owner)return false;const stays=this.target==='outside'?!this.inside(at,card):this.inside(at,this.rect);if(!stays)this.valid=false;return true;}
    up(id,at,card,choices,phase){if(id!==this.owner)return null;this.move(id,at,card);const accepted=this.valid&&phase!=='closing'&&(phase==='hold'||this.target==='outside'||this.target==='no')&&this.targetAt(at,card,choices)===this.target,target=accepted?this.target:'';this.cancel();return target;}
    inside(at,r){return at.length===2&&at.every(Number.isFinite)&&r.length===4&&at[0]>=r[0]&&at[1]>=r[1]&&at[0]<r[0]+r[2]&&at[1]<r[1]+r[3];}
    targetAt(at,card,choices){if(!at.every(Number.isFinite))return '';if(!this.inside(at,card))return 'outside';for(const name of Object.keys(choices))if(this.inside(at,choices[name]))return name;return '';}
}
function infoBubbleLayout(anchor,safe,naturalWidth,measuredHeight,options={}) {
    const r=safe.slice(),point=options.fontSize||24;
    if(options.aboveOnly){r[3]=Math.min(r[1]+r[3],anchor[1]+6)-r[1];if(r[3]<(options.confirmation?180:130))return [anchor[0],anchor[1],0,0];}
    const available=[r[0]+6,r[1]+6,r[2]-12,r[3]-12],max=Math.min(options.maxWidth||430,available[2]),min=Math.min(options.minWidth||270,max),w=Math2D.clamp(naturalWidth+56,min,max);
    let h=Math.min(Math.max(Math.max(measuredHeight,point*1.5)+44+(options.confirmation?62:0),options.confirmation?130:79),available[3]-24);
    const above=Math2D.clamp(anchor[1]-available[1]-20,0,available[3]-24),below=Math2D.clamp(available[1]+available[3]-anchor[1]-20,0,available[3]-24),under=above<h&&below>above;
    h=Math.min(h,Math.max(under?below:above,80));
    return [Math2D.clamp(anchor[0]-w/2,available[0],available[0]+available[2]-w),Math2D.clamp(under?anchor[1]+20:anchor[1]-h-20,available[1],available[1]+available[3]-h),w,h];
}
function registerUI(cc) {
    const node = (parent, name, rect) => {
        const n = new cc.Node(name); parent.addChild(n); n.setPosition(rect[0],-rect[1]);
        const ui = n.addComponent(cc.UITransform); ui.setAnchorPoint(0,1); ui.setContentSize(rect[2],rect[3]);
        return n;
    };
    const color = (values) => new cc.Color(...values.map(v => v*255));
    const polygon = (g, points, fill, stroke, width = 1.5) => {
        g.moveTo(points[0][0],-points[0][1]);
        points.slice(1).forEach(p => g.lineTo(p[0],-p[1])); g.close();
        g.fillColor = color(fill); g.fill();
        if (stroke) { g.strokeColor = color(stroke); g.lineWidth = width; g.stroke(); }
    };
    function pointer(target, callbacks, enabled = () => true) {
        let captured=-1;
        const point=event=>{const p=event.getUILocation(),local=target.getComponent(cc.UITransform).convertToNodeSpaceAR(new cc.Vec3(p.x,p.y,0));return [local.x,-local.y];};
        const cancel=()=>{if(captured===-1)return;captured=-1;if(callbacks.cancel)callbacks.cancel();};
        const start=event=>{
            if(captured!==-1||!enabled())return;
            const at=point(event),ui=target.getComponent(cc.UITransform);
            if(at[0]<0||at[1]<0||at[0]>=ui.width||at[1]>=ui.height)return;
            captured=event.getID();if(callbacks.down&&callbacks.down(at,captured)===false){captured=-1;return;}event.propagationStopped=true;
        };
        const move=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;if(!enabled()){cancel();return;}if(callbacks.move)callbacks.move(point(event),captured);};
        const end=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;if(!enabled()){cancel();return;}const id=captured;captured=-1;if(callbacks.up)callbacks.up(point(event),id);};
        const cancelled=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;cancel();};
        target.on(cc.Node.EventType.TOUCH_START,start);target.on(cc.Node.EventType.TOUCH_MOVE,move);target.on(cc.Node.EventType.TOUCH_END,end);target.on(cc.Node.EventType.TOUCH_CANCEL,cancelled);
        return {cancel,dispose(){cancel();target.off(cc.Node.EventType.TOUCH_START,start);target.off(cc.Node.EventType.TOUCH_MOVE,move);target.off(cc.Node.EventType.TOUCH_END,end);target.off(cc.Node.EventType.TOUCH_CANCEL,cancelled);}};
    }
    function action(target, callback, enabled = () => true, hitTest = null, feedback = null) {
        let pointer = -1, armed = false, generation = 0, hovered = false, focused = false, key = null;
        const snapshot = () => ({hovered, focused, pressed: armed || key !== null, pointer});
        const notify = () => { if (feedback) feedback(snapshot()); };
        const inside = (event) => {
            const p = event.getUILocation(), ui = target.getComponent(cc.UITransform);
            const local = ui.convertToNodeSpaceAR(new cc.Vec3(p.x,p.y,0));
            return local.x >= 0 && local.y <= 0 && local.x < ui.width && local.y > -ui.height && (!hitTest || hitTest([local.x, -local.y]));
        };
        const activate = () => {
            const intent = generation;
            cc.director.once(cc.Director.EVENT_AFTER_UPDATE, () => {
                if (intent === generation && target.isValid && target.activeInHierarchy && enabled()) callback();
            });
        };
        const cancel = () => { generation++; pointer = -1; armed = false; key = null; hovered = false; notify(); };
        const start = event => {
            if (pointer !== -1 || key !== null || !enabled() || !inside(event)) return;
            pointer = event.getID(); armed = true; event.propagationStopped = true;
            notify();
        };
        const move = event => {
            if (event.getID() !== pointer) return;
            if (!enabled() || !inside(event)) armed = false;
            event.propagationStopped = true; notify();
        };
        const end = event => {
            if (event.getID() !== pointer) return;
            const accepted = armed && enabled() && inside(event);
            pointer = -1; armed = false; event.propagationStopped = true; notify();
            if (accepted) activate();
        };
        const cancelled=event=>{if(event.getID()!==pointer)return;event.propagationStopped=true;cancel();};
        const hover=event=>{const next=enabled()&&inside(event);if(next!==hovered){hovered=next;notify();}};
        const mouseFocus=event=>{if(enabled()&&inside(event)&&api.onFocus)api.onFocus();};
        const leave=()=>{if(hovered){hovered=false;notify();}};
        const api = {cancel, snapshot, onFocus:null,
            setFocused(value) {const next=!!value&&enabled();if(next===focused)return;focused=next;if(!next){key=null;generation++;}notify();},
            keyDown(code) {if(!focused||!enabled()||pointer!==-1||key!==null)return false;key=code;notify();return true;},
            keyUp(code) {if(key!==code)return false;key=null;notify();if(focused&&enabled()&&target.isValid&&target.activeInHierarchy)callback();return true;},
            dispose() {cancel();focused=false;notify();if(cc.Node.EventType.MOUSE_DOWN&&feedback)target.off(cc.Node.EventType.MOUSE_DOWN,mouseFocus);target.off(cc.Node.EventType.TOUCH_START,start);target.off(cc.Node.EventType.TOUCH_MOVE,move);target.off(cc.Node.EventType.TOUCH_END,end);target.off(cc.Node.EventType.TOUCH_CANCEL,cancelled);for(const type of [cc.Node.EventType.MOUSE_ENTER,cc.Node.EventType.MOUSE_MOVE])if(type&&feedback)target.off(type,hover);if(cc.Node.EventType.MOUSE_LEAVE&&feedback)target.off(cc.Node.EventType.MOUSE_LEAVE,leave);}
        };
        target.on(cc.Node.EventType.TOUCH_START,start);target.on(cc.Node.EventType.TOUCH_MOVE,move);
        target.on(cc.Node.EventType.TOUCH_END,end);target.on(cc.Node.EventType.TOUCH_CANCEL,cancelled);
        if(feedback){if(cc.Node.EventType.MOUSE_DOWN)target.on(cc.Node.EventType.MOUSE_DOWN,mouseFocus);for(const type of [cc.Node.EventType.MOUSE_ENTER,cc.Node.EventType.MOUSE_MOVE])if(type)target.on(type,hover);if(cc.Node.EventType.MOUSE_LEAVE)target.on(cc.Node.EventType.MOUSE_LEAVE,leave);}
        return api;
    }
    function fixedBubble(parent, font, message, card, anchor, options = {}) {
        const root = node(parent, 'SpeechBubble', [0,0,1,1]), shape = node(root,'PaperShape',[0,0,1,1]);
        const graphics = shape.addComponent(cc.Graphics);
        const content = node(root,'Content',[card[0]+28,card[1]+20,card[2]-56,card[3]-40]);
        const text = content.addComponent(cc.Label); text.overflow = cc.Label.Overflow.RESIZE_HEIGHT; text.font = font; text.string = message;
        text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.CENTER;
        text.color = color([.376470588,.231372549,.133333333,1]);
        text.enableWrapText = true; text.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
        let size = options.fontSize || 24, minimum = options.minimumFontSize || Math.max(15,size-8), measured = [];
        const bounds = content.getComponent(cc.UITransform), allowedHeight = card[3]-40-(options.confirmation?62:0);
        while (true) {
            text.fontSize = size; text.lineHeight = size*(options.fontMetrics ? options.fontMetrics.height : 1.2);
            bounds.setContentSize(card[2]-56,allowedHeight);text.updateRenderData(true);
            measured.push({size,width:bounds.width,height:bounds.height,lineHeight:text.lineHeight});
            // Creator 3.8 adds 0.26 line of canvas padding; it is not text height.
            if (bounds.height - .26*text.lineHeight <= allowedHeight || size <= minimum) break;
            size--;
        }
        text.overflow = cc.Label.Overflow.CLAMP; bounds.setContentSize(card[2]-56,allowedHeight);
        if (options.fontMetrics) content.setPosition(card[0]+28,-(card[1]+20+(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*size/2));
        const shapeOpacity = shape.addComponent(cc.UIOpacity), contentOpacity = content.addComponent(cc.UIOpacity);
        let phase = 'pop', time = 0, hold = 0, contentAlpha = 0;
        const paint = scale => {
            const center=[card[0]+card[2]/2,card[1]+card[3]/2];
            graphics.clear();
            const base = card[1] > anchor[1] ? card[1] : card[1]+card[3];
            const tip = [Math2D.clamp(anchor[0],card[0]+22,card[0]+card[2]-22),Math2D.clamp(anchor[1],base-26,base+26)];
            const contour = paperBubbleContour(card,tip,anchor[1]<card[1]).map(p => [center[0]+(p[0]-center[0])*scale,center[1]+(p[1]-center[1])*scale]);
            polygon(graphics,contour.map(p=>[p[0],p[1]+4]),[.23,.12,.055,.12]);
            polygon(graphics,contour,[1,.945098039,.839215686,1],[.788235294,.654901961,.443137255,.58]);
        };
        const api = {root, text, layout(next,at) {card.splice(0,4,...next);anchor.splice(0,2,...at);bounds.setContentSize(Math.max(1,card[2]-56),Math.max(1,card[3]-40-(options.confirmation?62:0)));content.setPosition(card[0]+28,-(card[1]+20+(options.fontMetrics?(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*size/2:0)));}, close() {if(phase==='closing'||phase==='hidden')return;phase='closing';time=0;}, advance(delta) {
            time += Math.max(0,delta);
            let scale = 1, alpha = 1, textAlpha = 1;
            if (phase === 'pop') {
                const t = Math2D.clamp(time/.25,0,1), ease = 1-Math.pow(1-t,3);
                scale = .91+.09*ease+Math.sin(Math.PI*t)*.045; alpha=Math.min(t*4,1);textAlpha=0;
                if (t>=1) {phase='reveal';time=0;scale=1;}
            } else if (phase==='reveal') {
                const t = Math2D.clamp(time/.2,0,1); textAlpha=Math2D.smoothstep(0,1,t);
                if(t>=1) {phase='hold';time=0;}
            } else if (phase==='hold') {
                hold += Math.max(0,delta);
                if (!options.persistent && hold >= (options.holdSeconds || Math.max(2.2,1.55+message.length*.1))) api.close();
            } else if (phase==='closing') {
                const t=Math2D.clamp(time/.19,0,1);scale=1-.07*t*t;alpha=1-t;textAlpha=Math.max(1-1.6*t,0);
                if(t>=1) {phase='hidden';root.active=false;}
            }
            paint(scale);shapeOpacity.opacity=255*alpha;contentAlpha=alpha*textAlpha;contentOpacity.opacity=255*contentAlpha;
        }, snapshot: () => ({phase,fontSize:size,card:[...card],measured,contentAlpha})};
        api.advance(0); return api;
    }
    function infoBubble(parent,font,message,anchor,safe,options={}) {
        const probe=node(parent,'BubbleMeasurement',[0,0,1,1]),label=probe.addComponent(cc.Label),bounds=probe.getComponent(cc.UITransform),point=options.fontSize||24;
        label.font=font;label.string=message;label.fontSize=point;label.lineHeight=point*(options.fontMetrics?options.fontMetrics.height:1.2);label.enableWrapText=false;label.overflow=cc.Label.Overflow.NONE;label.updateRenderData(true);
        const natural=bounds.width,measurements=new Map();
        const initial=infoBubbleLayout(anchor,safe,natural,point*1.5,Object.assign({},options,{aboveOnly:false}));label.enableWrapText=true;label.overflow=cc.Label.Overflow.RESIZE_HEIGHT;bounds.setContentSize(Math.max(1,initial[2]-56),1);label.updateRenderData(true);const measured=Math.max(0,bounds.height-.26*label.lineHeight);measurements.set(Math.max(1,initial[2]-56),measured);probe.destroy();
        const card=infoBubbleLayout(anchor,safe,natural,measured,options),fallback=infoBubbleLayout(anchor,safe,natural,measured,Object.assign({},options,{aboveOnly:false})),api=fixedBubble(parent,font,message,card[2]>0?card:fallback,anchor.slice(),options),advance=api.advance,snapshot=api.snapshot;
        let blocked=false,currentSafe=safe.slice(),lastAnchor=anchor.slice();
        api.layoutFor=(at,nextSafe)=>{
            const initial=infoBubbleLayout(at,nextSafe,natural,point*1.5,Object.assign({},options,{aboveOnly:false})),width=Math.max(1,initial[2]-56);
            if(!measurements.has(width)){
                const probe=node(parent,'BubbleMeasurement',[0,0,width,1]),label=probe.addComponent(cc.Label),bounds=probe.getComponent(cc.UITransform);
                label.font=font;label.string=message;label.fontSize=point;label.lineHeight=point*(options.fontMetrics?options.fontMetrics.height:1.2);label.enableWrapText=true;label.overflow=cc.Label.Overflow.RESIZE_HEIGHT;label.updateRenderData(true);
                measurements.set(width,Math.max(0,bounds.height-.26*label.lineHeight));probe.destroy();
            }
            return infoBubbleLayout(at,nextSafe,natural,measurements.get(width),options);
        };
        api.setSafe=nextSafe=>{if(nextSafe.length!==4||!nextSafe.every(Number.isFinite)||nextSafe[2]<=0||nextSafe[3]<=0)throw new Error('Invalid bubble safe rect');currentSafe=nextSafe.slice();api.setAnchor(lastAnchor);};
        api.setAnchor=at=>{lastAnchor=at.slice();const rect=api.layoutFor(at,currentSafe);blocked=rect[2]===0;api.layout(rect,at);api.root.children.forEach(child=>{child.active=!blocked;});};
        api.advance=delta=>{if(!blocked)advance(delta);};api.snapshot=()=>Object.assign(snapshot(),{speakerClearanceBlocked:blocked});api.setAnchor(anchor);return api;
    }
    function confirmationBubble(parent,font,message,anchor,safe,options={}) {
        const settings=Object.assign({},options,{confirmation:true,persistent:true}),api=infoBubble(parent,font,message,anchor,safe,settings),choices=node(api.root,'Choices',[0,0,1,1]),opacity=choices.addComponent(cc.UIOpacity),owner=new BubblePointer(),buttons={},divider=node(choices,'Divider',[0,0,1,1]).addComponent(cc.Graphics);
        let rects={},decided=false;
        ['yes','no'].forEach((key,index)=>{if(options.cancelOnly&&key==='yes')return;const root=node(choices,key,[0,0,1,1]),text=root.addComponent(cc.Label);text.font=font;text.string=index?(options.cancelText===undefined?'Cancel':options.cancelText):(options.acceptText===undefined?'OK':options.acceptText);text.fontSize=options.fontSize||24;text.lineHeight=text.fontSize*(options.fontMetrics?options.fontMetrics.height:1.2);text.horizontalAlign=cc.Label.HorizontalAlign.CENTER;text.verticalAlign=cc.Label.VerticalAlign.CENTER;const ink=[.376470588,.231372549,.133333333],light=index?(options.cancelLighten||0):0;text.color=color([...ink.map(v=>v+(1-v)*light),1]);text.overflow=cc.Label.Overflow.CLAMP;buttons[key]=root;});
        const setAnchor=api.setAnchor,advance=api.advance,snapshot=api.snapshot;
        api.setAnchor=at=>{setAnchor(at);const state=snapshot(),r=state.card,w=Math.max(1,(r[2]-48)/2);rects=options.cancelOnly?{no:[r[0]+(r[2]-w)/2,r[1]+r[3]-54,w,44]}:{yes:[r[0]+18,r[1]+r[3]-54,w,44],no:[r[0]+30+w,r[1]+r[3]-54,w,44]};Object.keys(buttons).forEach(key=>{const node=buttons[key],r=rects[key];node.setPosition(r[0],-(r[1]+(options.fontMetrics?(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*(options.fontSize||24)/2:0)));node.getComponent(cc.UITransform).setContentSize(r[2],r[3]);});divider.clear();divider.strokeColor=color([.376470588,.231372549,.133333333,.11]);divider.lineWidth=1;divider.moveTo(r[0]+29,-(r[1]+r[3]-60));divider.lineTo(r[0]+r[2]-29,-(r[1]+r[3]-60));divider.stroke();choices.active=!state.speakerClearanceBlocked;};
        api.advance=delta=>{advance(delta);opacity.opacity=255*snapshot().contentAlpha;};
        api.down=(id,at)=>owner.down(id,at,snapshot().card,choices.active?rects:{},snapshot().phase);
        api.move=(id,at)=>owner.move(id,at,snapshot().card);
        api.up=(id,at)=>{const target=owner.up(id,at,snapshot().card,choices.active?rects:{},snapshot().phase);if(target&&!decided){decided=true;api.close();if(options.onDecision)options.onDecision(target==='yes');}return target!==null;};
        api.cancelPointer=()=>owner.cancel();
        api.snapshot=()=>Object.assign(snapshot(),{choices:rects,decided,capturedPointer:owner.owner});api.setAnchor(anchor);return api;
    }
    function hangingReturn(parent, font, rect, callback, enabled = () => true, swing = new SwingFeedback(), inputParent = null) {
        const root = node(parent,'HangingReturn',rect), sx=rect[2]/78,sy=rect[3]/128;
        const visual = node(root,'Swing',[39*sx,4*sy,1,1]); visual.setScale(sx,sy,1);
        const g = visual.addComponent(cc.Graphics);
        const outline=[[-25,29],[-30,34],[-29,113],[-24,120],[24,120],[29,115],[30,35],[25,29],[8,27],[-12,28]];
        polygon(g,outline.map(p=>[p[0]+1.5,p[1]+2.5]),[.18,.08,.025,.24]);
        polygon(g,outline,[.596078431,.376470588,.215686275,1]);
        polygon(g,outline.map(p=>[p[0]*.91,(p[1]-74)*.95+74]),[.972549020,.874509804,.674509804,1],[.843137255,.650980392,.396078431,1],1.2);
        const line=(a,b,c,width)=>{g.strokeColor=color(c);g.lineWidth=width;g.moveTo(a[0],-a[1]);g.lineTo(b[0],-b[1]);g.stroke();};
        line([0,0],[-4,31],[.411764706,.262745098,.152941176,1],3);
        line([-2,0],[-2,30],[.701960784,.525490196,.298039216,1],1);
        line([-24,40],[-23,105],[.62,.35,.16,.17],1);line([23,47],[22,112],[.62,.35,.16,.16],1);
        g.strokeColor=color([.518588235,.327529412,.187686275,1]);g.lineWidth=1.5;g.circle(-4,-32,3.5);g.stroke();
        line([-4,27],[-4,34],[.474509804,.313725490,.172549020,1],2);
        line([6,49],[-7,49],[.4,.235294118,.129411765,1],2.8);
        line([-7,49],[-1,43],[.4,.235294118,.129411765,1],2.8);line([-7,49],[0,55],[.4,.235294118,.129411765,1],2.8);
        ['返','回'].forEach((letter,i)=>{
            const n=node(visual,'ReturnLetter'+i,[-20,57+i*26,40,29]),l=n.addComponent(cc.Label);
            l.overflow=cc.Label.Overflow.CLAMP;l.font=font;l.string=letter;l.fontSize=24;l.lineHeight=29;l.horizontalAlign=cc.Label.HorizontalAlign.CENTER;
            l.verticalAlign=cc.Label.VerticalAlign.CENTER;l.color=color([.4,.235294118,.129411765,1]);
        });
        g.fillColor=color([.548392157,.346352941,.198431373,1]);g.circle(0,-119,2.3);g.fill();
        const pin=node(root,'Pin',[39*sx,4*sy,1,1]).addComponent(cc.Graphics);
        pin.fillColor=color([.488784314,.308705882,.176862745,1]);pin.circle(0,0,2.6);pin.fill();
        // An offscreen visual can use an aligned onscreen logical input frame.
        // No render-target camera coordinates enter the pointer ownership code.
        const hit=node(inputParent || root,'FixedReturnHitArea',[(inputParent?rect[0]:0)+rect[2]*.09,(inputParent?rect[1]:0)+rect[3]*.23,rect[2]*.82,rect[3]*.76]);
        const focusInk=node(visual,'FocusRim',[0,0,1,1]),focusGraphics=focusInk.addComponent(cc.Graphics);focusInk.active=false;
        focusGraphics.strokeColor=color([181/255,127/255,63/255,1]);focusGraphics.lineWidth=2.2;
        const rim=outline.map(p=>[p[0]*.91,(p[1]-74)*.95+74]);focusGraphics.moveTo(rim[0][0],-rim[0][1]);rim.slice(1).forEach(p=>focusGraphics.lineTo(p[0],-p[1]));focusGraphics.close();focusGraphics.stroke();
        let previous={pressed:false,hovered:false};
        const binding=action(hit,callback,enabled,null,state=>{if(state.pressed&&!previous.pressed)swing.press();if(!state.pressed&&previous.pressed)swing.release();if(state.hovered&&!previous.hovered)swing.velocity+=.04;focusInk.active=state.focused;previous=state;});
        return {root,motion:swing,input:binding,cancel:binding.cancel,dispose(){binding.dispose();if(inputParent)hit.destroy();},advance(delta){swing.advance(delta);visual.angle=-swing.angle*180/Math.PI;visual.setScale(sx*swing.scale,sy*swing.scale,1);}};
    }
    return Object.freeze({node, color, polygon, pointer, action, fixedBubble, infoBubble, confirmationBubble, hangingReturn, choiceBubble:(...args)=>createChoiceBubble(cc,{node,color,polygon},...args)});
}
Object.assign(api, {clipPolygonBelow, paperBubbleContour, registerUI, SwingFeedback,infoBubbleLayout,BubblePointer});

// Shared modal geometry, typography and owned pointer/scroll state. Game prose,
// portraits, sounds and save decisions stay with the consuming game page.
function ellipseBubbleContour(card,tip,above=false){
    const out=[],[x,y,w,h]=card;
    for(let i=0;i<=64;i++){const a=Math.PI*2*i/64,k=1+.012*Math.sin(a*5)+.007*Math.cos(a*7);out.push([x+w/2+Math.cos(a)*w/2*k,y+h/2+Math.sin(a)*h/2*k]);if(i===(above?43:22)){out.push(tip.slice());const next=Math.PI*2*(i+1)/64;out.push([x+w/2+Math.cos(next)*w*.435,y+h/2+Math.sin(next)*h*.435]);}}
    return out;
}
function choiceBubbleLayout(body,safe,anchor,count,options={}){
    const available=[safe[0]+6,safe[1]+6,safe[2]-12,safe[3]-12],w=Math.min(body[2],available[2]),h=Math.min(body[3],available[3]);
    const card=[Math2D.clamp(body[0],available[0],available[0]+available[2]-w),Math2D.clamp(body[1],available[1],available[1]+available[3]-h),w,h],pad=options.padding||[28,20],content=[card[0]+pad[0],card[1]+pad[1],w-pad[0]*2,h-pad[1]*2];
    const rows=Math.ceil(count/2),height=Math.max(46,options.choiceHeight||58),hint=options.hint?(options.hintHeight||26):0,textHeight=Math.max(1,content[3]-rows*height-Math.max(0,rows-1)*12-(rows?12:0)-hint-(hint?4:0));
    const choices=Array.from({length:count},(_,i)=>{const row=Math.floor(i/2),columns=Math.min(2,count-row*2),width=(content[2]-12*(columns-1))/columns;return [content[0]+i%2*(width+12),content[1]+textHeight+12+row*(height+12),width,height];});
    const above=anchor[1]<card[1],base=above?card[1]:card[1]+h,tip=[Math2D.clamp(Math2D.clamp(anchor[0],available[0],available[0]+available[2]),card[0]+22,card[0]+w-22),Math2D.clamp(Math2D.clamp(anchor[1],available[1],available[1]+available[3]),base-26,base+26)];
    return {card,text:[content[0],content[1],content[2],textHeight],choices,hint:hint?[content[0],content[1]+content[3]-hint,content[2],hint]:null,close:[card[0]+w-41,card[1]-2,46,46],tip,above};
}
class ChoicePointer {
    constructor(){this.cancel();}
    cancel(){this.owner=null;this.target='';this.valid=false;this.last=null;}
    inside(at,r){return !!r&&at.length===2&&at.every(Number.isFinite)&&at[0]>=r[0]&&at[1]>=r[1]&&at[0]<r[0]+r[2]&&at[1]<r[1]+r[3];}
    targetAt(at,layout,interaction,close){if(close&&this.inside(at,layout.close))return 'close';if(!this.inside(at,interaction))return 'outside';if(this.inside(at,layout.text))return 'scroll';const i=layout.choices.findIndex(r=>this.inside(at,r));return i>=0?String(i):'';}
    down(id,at,layout,interaction,phase,supported,close=true){if(this.owner!==null)return;this.owner=id;this.last=at.slice();this.target=this.targetAt(at,layout,interaction,close);if(phase==='closing'||phase==='hidden'||phase!=='hold'&&this.target!=='outside'&&this.target!=='close'||!supported&&/^\d+$/.test(this.target))this.target='';this.valid=!!this.target;}
    move(id,at,layout,interaction,close=true){if(this.owner!==id)return 0;const delta=this.last[1]-at[1];this.last=at.slice();if(this.target==='scroll')return delta;if(this.targetAt(at,layout,interaction,close)!==this.target)this.valid=false;return 0;}
    up(id,at,layout,interaction,phase,supported,close=true){if(id!==this.owner)return null;this.move(id,at,layout,interaction,close);const target=this.valid?this.target:'';this.cancel();return phase==='closing'||phase==='hidden'||target==='scroll'||(/^\d+$/.test(target)&&(phase!=='hold'||!supported))?'':target;}
}
function createChoiceBubble(cc,ui,parent,font,message,captions,anchor,safe,options={}){
    const {node,color,polygon}=ui,root=node(parent,'ChoiceSpeechBubble',[0,0,1,1]),shape=node(root,'EllipsePaper',[0,0,1,1]),g=shape.addComponent(cc.Graphics),shapeOpacity=shape.addComponent(cc.UIOpacity),content=node(root,'Content',[0,0,1,1]),contentOpacity=content.addComponent(cc.UIOpacity),owner=new ChoicePointer();
    let supported=true,phase='pop',time=0,alpha=0,scroll=0,decided=false,layout,lastScale=NaN;
    const checked=value=>{if(!options.hasGlyph||Array.from(value).every(c=>c==='\n'||c==='\r'||c==='\t'||options.hasGlyph(c)))return value;supported=false;const fallback=options.unsupportedText||'';return Array.from(fallback).every(c=>options.hasGlyph(c))?fallback:'';};
    message=checked(message);captions=captions.map(checked);const hint=checked(options.hint||''),ink=options.ink||[.37647,.23137,.13333,1],paper=options.paper||[1,.9451,.8392,1],edge=options.edge||[.7882,.6549,.4431,1];
    const textNode=node(content,'MessageViewport',[0,0,1,1]);textNode.addComponent(cc.Mask);const textRoot=node(textNode,'Message',[0,0,1,1]),text=textRoot.addComponent(cc.Label);
    const labels=captions.map((caption,i)=>{const n=node(content,'Option'+i,[0,0,1,1]);return {node:n,label:n.addComponent(cc.Label),caption};}),hintNode=node(content,'Hint',[0,0,1,1]),hintLabel=hintNode.addComponent(cc.Label),closeNode=node(content,'Close',[0,0,1,1]),closeGraphics=closeNode.addComponent(cc.Graphics);
    const metrics=options.fontMetrics||{height:1.2,ascent:.97,descent:.23};
    function fit(label,value,r,point,minimum,scrollable=false){
        const n=label.node,bounds=n.getComponent(cc.UITransform);label.font=font;label.string=value;label.enableWrapText=true;label.horizontalAlign=cc.Label.HorizontalAlign.CENTER;label.verticalAlign=cc.Label.VerticalAlign.CENTER;label.color=color(ink);label.overflow=cc.Label.Overflow.RESIZE_HEIGHT;
        let measured=0;
        for(;;){label.fontSize=point;label.lineHeight=point*metrics.height;bounds.setContentSize(r[2],r[3]);label.updateRenderData(true);measured=Math.max(0,bounds.height-.26*label.lineHeight);if(measured<=r[3]||point<=minimum)break;point--;}
        const h=scrollable?Math.max(r[3],measured):r[3];label.overflow=cc.Label.Overflow.CLAMP;bounds.setContentSize(r[2],h);n.setPosition(r[0],-(r[1]+(metrics.ascent-metrics.descent-.74)*point/2));return {height:h,point};
    }
    // The game supplies a renderer backed by already-admitted generic drawing
    // resources; contour, alpha and line geometry remain framework-owned.
    const drawing=options.createDrawing;
    const outline=drawing?drawing(shape,'BubbleOutline'):null;
    const closePaper=drawing?drawing(closeNode,'ClosePaper'):null;
    const closeRim=drawing?drawing(closeNode,'CloseRim'):null;
    const closeCross=drawing?drawing(closeNode,'CloseCross'):null;
    const closeOpacity=closeNode.addComponent(cc.UIOpacity);
    // Close paper follows shape alpha; its X follows text alpha independently.
    if(drawing){root.addChild(closeNode);for(const layer of [closePaper,closeRim,closeCross])layer.root.addComponent(cc.UIOpacity);}
    let textSize;
    function positionScroll(){const offset=(metrics.ascent-metrics.descent-.74)*textSize.point/2;textRoot.setPosition(0,scroll-offset);}
    function relayout(nextSafe=safe,nextAnchor=anchor){
        safe=nextSafe.slice();anchor=nextAnchor.slice();owner.cancel();lastScale=NaN;layout=choiceBubbleLayout(options.bodyRect,safe,anchor,captions.length,Object.assign({},options,{hint}));
        const r=layout.text;textNode.setPosition(r[0],-r[1]);textNode.getComponent(cc.UITransform).setContentSize(r[2],r[3]);textSize=fit(text,message,[0,0,r[2],r[3]],options.fontSize||24,options.minimumFontSize||16,true);scroll=Math2D.clamp(scroll,0,textSize.height-r[3]);positionScroll();
        labels.forEach((v,i)=>{const r=layout.choices[i];fit(v.label,v.caption,[r[0]+4,r[1]+3,r[2]-8,r[3]-6],options.choiceFontSize||24,15);});
        hintNode.active=!!layout.hint;if(layout.hint)fit(hintLabel,hint,layout.hint,options.hintFontSize||16,14);
        closeNode.active=options.showClose!==false;closeNode.setPosition(layout.close[0],-layout.close[1]);closeNode.getComponent(cc.UITransform).setContentSize(46,46);paintClose();
    }
    function paintClose(){
        if(drawing){
            closePaper.draw(filledCircle([23,23],20),paper);
            closeRim.draw(featherPolyline(Array.from({length:32},(_,i)=>[23+Math.cos(i*Math.PI*2/31)*20,23+Math.sin(i*Math.PI*2/31)*20]),1.5),edge);
            closeCross.draw(mergeDrawingMeshes([featherLine([17,17],[29,29],2.5),featherLine([29,17],[17,29],2.5)]),ink);
            return;
        }
        const c=closeGraphics;c.clear();c.fillColor=color(paper);c.circle(23,-23,20);c.fill();c.strokeColor=color(edge);c.lineWidth=1.5;c.circle(23,-23,20);c.stroke();c.strokeColor=color(ink);c.lineWidth=2.5;c.moveTo(17,-17);c.lineTo(29,-29);c.moveTo(29,-17);c.lineTo(17,-29);c.stroke();}
    function paint(scale){if(scale===lastScale)return;lastScale=scale;g.clear();const r=layout.card,center=[r[0]+r[2]/2,r[1]+r[3]/2],points=ellipseBubbleContour(r,layout.tip,layout.above).map(p=>p.map((v,i)=>center[i]+(v-center[i])*scale));polygon(g,points.map(p=>[p[0],p[1]+4]),[.23,.12,.055,.12]);polygon(g,points,paper,outline?null:[edge[0],edge[1],edge[2],.58],1.5);if(outline)outline.draw(featherPolyline(points.concat([points[0]]),1.5),[edge[0],edge[1],edge[2],.58]);}
    const api={root,text,layout:relayout,close(){if(phase==='closing'||phase==='hidden')return;owner.cancel();phase='closing';time=0;},scrollBy(delta){if(!Number.isFinite(delta)||phase!=='hold')return;scroll=Math2D.clamp(scroll+delta,0,textSize.height-layout.text[3]);positionScroll();},advance(delta){
        time+=Number.isFinite(delta)?Math.max(0,delta):0;let scale=1,shapeAlpha=1,textAlpha=1;
        if(phase==='pop'){const t=Math2D.clamp(time/.25,0,1);scale=.91+.09*(1-(1-t)**3)+Math.sin(Math.PI*t)*.045;shapeAlpha=Math.min(t*4,1);textAlpha=0;if(t>=1){phase='reveal';time=0;scale=1;}}
        else if(phase==='reveal'){const t=Math2D.clamp(time/.2,0,1);textAlpha=Math2D.smoothstep(0,1,t);if(t>=1){phase='hold';time=0;}}
        else if(phase==='closing'){const t=Math2D.clamp(time/.19,0,1);scale=1-.07*t*t;shapeAlpha=1-t;textAlpha=Math.max(1-1.6*t,0);if(t>=1){phase='hidden';root.active=false;}}
        paint(scale);shapeOpacity.opacity=255*shapeAlpha;alpha=textAlpha;contentOpacity.opacity=255*alpha;if(drawing){closeOpacity.opacity=255;closePaper.root.getComponent(cc.UIOpacity).opacity=255*shapeAlpha;closeRim.root.getComponent(cc.UIOpacity).opacity=255*shapeAlpha;closeCross.root.getComponent(cc.UIOpacity).opacity=255*textAlpha;}
    },down(id,at){owner.down(id,at,layout,options.interactionRect||layout.card,phase,supported,options.showClose!==false);},move(id,at){api.scrollBy(owner.move(id,at,layout,options.interactionRect||layout.card,options.showClose!==false));},up(id,at){const target=owner.up(id,at,layout,options.interactionRect||layout.card,phase,supported,options.showClose!==false);if(target&&!decided){decided=true;api.close();if(target==='close'||target==='outside'){if(options.onCancel)options.onCancel();}else if(options.onChoice)options.onChoice(Number(target));}return target!==null;},cancelPointer(){owner.cancel();},snapshot(){return {phase,card:layout.card.slice(),choices:layout.choices.map(r=>r.slice()),close:layout.close.slice(),textRect:layout.text.slice(),fontSize:textSize.point,textHeight:textSize.height,scroll,contentSupported:supported,contentAlpha:alpha,capturedPointer:owner.owner,decided};}};
    relayout();api.advance(0);return api;
}
Object.assign(api,{ellipseBubbleContour,choiceBubbleLayout,ChoicePointer});

// Two update ticks and one actual draw precede the sine-out entrance.
function createPageRouter(cc, owner) {
    let request=null, fade=null, generation=0;
    const event = (type, scope) => new Promise((resolve,reject)=>{
        let settled=false;
        const cleanup=()=>{cc.director.off(type,ready);if(!settled){settled=true;reject(new CancelledError());}};
        const ready=()=>{if(settled)return;settled=true;scope.disown(cleanup);resolve();};
        cc.director.once(type,ready);
        scope.own(cleanup);
    });
    const cancel=()=>{generation++;if(request)request.dispose();request=null;fade=null;};owner.own(cancel);
    return {cancel, async show(root,duration,canRun=()=>true) {
        cancel();const intent=generation,scope=new Lifetime(owner);request=scope;
        const opacity=root.getComponent(cc.UIOpacity)||root.addComponent(cc.UIOpacity);
        root.active=true;root.setSiblingIndex(root.parent.children.length-1);opacity.opacity=0;
        let committed=false;
        scope.own(()=>{if(!committed&&root.isValid){opacity.opacity=255;root.active=false;}});
        try {
            await event(cc.Director.EVENT_AFTER_UPDATE,scope);await event(cc.Director.EVENT_AFTER_UPDATE,scope);
            await event(cc.Director.EVENT_AFTER_DRAW,scope);
            while(!canRun())await event(cc.Director.EVENT_AFTER_UPDATE,scope);
            if(duration>0)await new Promise((resolve,reject)=>{
                fade={root,opacity,duration,elapsed:0,resolve};
                scope.own(()=>{if(fade&&fade.root===root)fade=null;reject(new CancelledError());});
            });
            if(!scope.active||generation!==intent)return false;
            opacity.opacity=255;committed=true;request=null;scope.dispose();return true;
        } catch(error) {scope.dispose();if(error.name==='CancelledError')return false;throw error;}
    }, advance(delta,active) {
        if(!fade||!active)return;fade.elapsed+=Math.max(0,delta);const t=Math2D.clamp(fade.elapsed/fade.duration,0,1);
        fade.opacity.opacity=255*Math.sin(t*Math.PI/2);
        if(t>=1){const completed=fade;fade=null;completed.resolve();}
    }};
}
Object.assign(api,{createPageRouter});

// Cocos transport only. Game sound choices, clocks and rewards live in games/.
api.registerAudio = function(cc) {
    return {player(parent, owner, name, notify = () => {}) {
        const node = new cc.Node(name); parent.addChild(node);
        const source = node.addComponent(cc.AudioSource); source.playOnAwake = false;
        let disposed = false, wanted = 'stopped';
        const counts = {playRequests: 0, actualStarts: 0, actualEnds: 0, pauses: 0, stops: 0, lateStartsStopped: 0};
        const snapshot = () => ({name, disposed, wanted, playing: !disposed && source.playing,
            seconds: disposed ? 0 : source.currentTime, volume: disposed ? 0 : source.volume, ...counts});
        const started = () => {
            if (disposed || !owner.active || wanted !== 'playing') {
                source.stop(); counts.lateStartsStopped++; notify('late-start-stopped', snapshot()); return;
            }
            counts.actualStarts++; notify('started', snapshot());
        };
        const ended = () => {if (disposed) return; counts.actualEnds++; if (!source.loop) wanted = 'stopped'; notify('ended', snapshot());};
        node.on(cc.AudioSource.EventType.STARTED, started); node.on(cc.AudioSource.EventType.ENDED, ended);
        const port = {
            assign(clip, loop = false) {if (disposed) return; port.stop(); source.clip = clip; source.loop = loop;},
            play() {if (disposed || !owner.active || !source.clip || wanted === 'playing') return false;
                wanted = 'playing'; counts.playRequests++; source.play(); return true;},
            pause() {if (disposed || wanted !== 'playing') return false;
                wanted = 'paused'; counts.pauses++; source.pause(); return true;},
            stop() {if (disposed) return false; const pending = wanted !== 'stopped' || source.playing;
                wanted = 'stopped'; if (source.clip) source.stop(); if (pending) counts.stops++; return pending;},
            gain(value) {if (!disposed && Number.isFinite(value)) source.volume = Math.max(0, Math.min(1, value));},
            get playing() {return !disposed && source.playing;},
            snapshot,
            dispose() {if (disposed) return; port.stop(); disposed = true;
                node.off(cc.AudioSource.EventType.STARTED, started); node.off(cc.AudioSource.EventType.ENDED, ended);
                source.clip = null; node.destroy(); notify('disposed', snapshot());},
        };
        owner.own(port.dispose); return port;
    }};
};

// Exact boolean rows, including masks whose width is not a multiple of eight.
api.bitMapContains = function(mask, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= mask.size[0] || y >= mask.size[1]) return false;
    const row = mask.rows[y];
    // Each pair is a half-open positive run, authored offline from original bits.
    let lo = 0, hi = row.length / 2;
    while (lo < hi) {
        const middle = Math.floor((lo + hi) / 2), start = row[middle * 2], end = row[middle * 2 + 1];
        if (x < start) hi = middle;
        else if (x >= end) lo = middle + 1;
        else return true;
    }
    return false;
};

// Consume native shaped glyph runs. Shaping, prose, font choice and atlas loading
// belong to the producer. Geometry contains no game-specific strings or assets.
// Alignment/raster origins follow Godot 4.5.2 Label and TextServerAdvanced;
// upstream MIT notice is retained by the plugin distribution.
function shapedInkLineMesh(table,run,rect,density=1){
    if(!run||!table||!table.glyphs[String(density)]||rect.length!==4||!rect.every(Number.isFinite)||!Number.isFinite(run.width)||run.glyphs.length>4096)throw new Error('Invalid shaped text input');
    const source=[],vertices=[],indices=[],glyphs=table.glyphs[String(density)];
    const start=Math.round(rect[0])+Math.trunc(Math.trunc(rect[2]-run.width)/2);
    // A GUI Control snaps its own translated origin before font_draw_glyph
    // floors the glyph-local origin. Combining those two steps loses 1 px.
    const localBaseline=(rect[3]-table.height)/2+table.ascent;
    const controlY=Math.round(rect[1]+(rect[3]-run.ink[0]-run.ink[1])/2-localBaseline);
    const baseline=controlY+Math.trunc((rect[3]-table.height)/2)+table.ascent;
    for(const item of run.glyphs){
        const variants=glyphs[String(item[0])];if(!variants||![1,2,4].includes(variants.length))throw new Error('Missing shaped glyph');
        let x=start+item[1],y=baseline+item[2];
        const subdivisions=variants.length,bias=subdivisions>1?.5/subdivisions:0;
        const variant=subdivisions>1?((Math.floor(subdivisions*(x+bias))-subdivisions*Math.floor(x+bias))%subdivisions+subdivisions)%subdivisions:0,g=variants[variant];
        if(density===1){x=Math.floor(x+bias);y=Math.floor(y);}
        const [u,v,w,h]=g.rect;if(!w||!h)continue;x+=g.offset[0];y+=g.offset[1];const right=x+g.size[0],bottom=y+g.size[1],base=vertices.length/2;
        source.push(u,v,u+w,v,u+w,v+h,u,v+h);vertices.push(x,y,right,y,right,bottom,x,bottom);indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    return {source:new Float32Array(source),vertices:new Float32Array(vertices),indices:new Uint16Array(indices)};
}
Object.assign(api,{shapedInkLineMesh});

// A separately rendered 2D world. Presentation opacity belongs to the display
// sprite; it must not also fade the offscreen world and multiply alpha twice.
const surfaceHostLayers = new WeakMap();
function registerRenderSurface(cc) {
    const {Node, UITransform, Canvas, Camera, Color, Sprite, SpriteFrame, RenderTexture, director, Director} = cc;
    function estimateTarget(width, height) {
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('Invalid render target size');
        // Color RGBA8 plus a conservative four-byte depth/stencil attachment.
        return width * height * 8;
    }
    function createTarget(width, height, name) {
        estimateTarget(width, height);
        const texture = new RenderTexture();
        try {
            texture.initialize({width, height, name});
            texture.setFilters(RenderTexture.Filter.LINEAR, RenderTexture.Filter.LINEAR);
            texture.setMipFilter(RenderTexture.Filter.NONE);
            texture.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
            return texture;
        } catch (error) { texture.destroy(); throw error; }
    }
    function create({host, displayParent, logicalSize, displayRect, target, layer, name = 'WorldSurface'}, scope) {
        if (!scope.active) throw new CancelledError();
        if (!host || !displayParent) throw new Error('Surface requires scene/display hosts');
        let claimed = surfaceHostLayers.get(host);
        if (!claimed) {claimed = new Set(); surfaceHostLayers.set(host, claimed);}
        if (layer === undefined) {
            for (let bit = 19; bit >= 0; bit--) if (!claimed.has(1 << bit)) {layer = 1 << bit; break;}
        }
        if (!(layer > 0 && layer <= (1 << 19)) || (layer & (layer - 1)) || claimed.has(layer)) throw new Error('Surface requires an available user layer');
        claimed.add(layer);
        scope.own(() => claimed.delete(layer));
        const canvasNode = new Node(name), cameraNode = new Node(name + 'Camera'), content = new Node(name + 'Content'), display = new Node(name + 'Image');
        canvasNode.active = false; host.addChild(canvasNode);
        canvasNode.addChild(cameraNode); canvasNode.addChild(content); displayParent.addChild(display);
        const canvasUI = canvasNode.addComponent(UITransform), contentUI = content.addComponent(UITransform), displayUI = display.addComponent(UITransform);
        canvasUI.setAnchorPoint(.5, .5); contentUI.setAnchorPoint(0, 1); displayUI.setAnchorPoint(0, 1);
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO; camera.visibility = layer;
        camera.priority = -1; camera.near = 1; camera.far = 2000;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 0);
        cameraNode.setPosition(0, 0, 1000);
        const canvas = canvasNode.addComponent(Canvas); canvas.alignCanvasWithScreen = false; canvas.cameraComponent = camera;
        const sprite = display.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        display.layer = displayParent.layer;
        let frame = null, disposed = false, readyFrames = 0, settleReady = null, ready = null;
        const afterDraw = () => {
            if (!canvasNode.active || !camera.targetTexture || !camera.enabledInHierarchy || disposed) return;
            if (++readyFrames < 2) return;
            director.off(Director.EVENT_AFTER_DRAW, afterDraw);
            const settle = settleReady; settleReady = null; if (settle) settle();
        };
        function resetReady(hasTarget) {
            director.off(Director.EVENT_AFTER_DRAW, afterDraw);
            if (settleReady) settleReady(new CancelledError());
            readyFrames = 0;
            ready = new Promise((resolve, reject) => {settleReady = error => error ? reject(error) : resolve();});
            // A parked or superseded target may have no readiness consumer.
            ready.catch(() => {});
            if (hasTarget) director.on(Director.EVENT_AFTER_DRAW, afterDraw);
            else {settleReady(new CancelledError()); settleReady = null;}
        }
        const watched = new Map();
        function exclude(node) {
            const record = watched.get(node); if (!record) return;
            node.off(Node.EventType.CHILD_ADDED, record.added); node.off(Node.EventType.CHILD_REMOVED, record.removed);
            watched.delete(node); node.layer = record.previousLayer; node.children.forEach(exclude);
        }
        function include(node) {
            if (watched.has(node)) return;
            const previousLayer = node.layer;
            node.layer = layer;
            const added = child => include(child), removed = child => exclude(child);
            watched.set(node, {added, removed, previousLayer});
            node.on(Node.EventType.CHILD_ADDED, added); node.on(Node.EventType.CHILD_REMOVED, removed);
            node.children.forEach(include);
        }
        include(canvasNode);
        function layout(size, rect, texture) {
            if (disposed || !scope.active) return false;
            if (!size.every(value => Number.isFinite(value) && value > 0) || !rect.every(Number.isFinite)) throw new Error('Invalid surface layout');
            canvasUI.setContentSize(size[0], size[1]); contentUI.setContentSize(size[0], size[1]);
            content.setPosition(-size[0] / 2, size[1] / 2);
            display.setPosition(rect[0], -rect[1]); displayUI.setContentSize(rect[2], rect[3]);
            camera.orthoHeight = size[1] / 2;
            if (camera.targetTexture !== texture || !ready) resetReady(!!texture);
            // RenderTexture.reset destroys the window attachments AND clears
            // its cameras. The Camera setter skips identical targets, so detach
            // before reattaching after an in-place reset (including rollback).
            if (camera.targetTexture === texture) camera.targetTexture = null;
            camera.targetTexture = texture;
            if (!texture) {
                canvasNode.active = false; sprite.spriteFrame = null;
                if (frame) frame.destroy(); frame = null; return true;
            }
            if (!frame || frame.texture !== texture || frame.originalSize?.width !== texture.width || frame.originalSize?.height !== texture.height) {
                const old = frame; frame = new SpriteFrame(); frame.texture = texture; frame.packable = false;
                // Builtin Sprite's SAMPLE_FROM_RT handles the graphics backend's
                // render-texture orientation. Never apply another manual flip.
                sprite.spriteFrame = frame; if (old) old.destroy();
            }
            return true;
        }
        function dispose() {
            if (disposed) return; disposed = true;
            director.off(Director.EVENT_AFTER_DRAW, afterDraw);
            if (settleReady) {settleReady(new CancelledError()); settleReady = null;}
            canvasNode.active = false; camera.enabled = false; camera.targetTexture = null;
            exclude(canvasNode); sprite.spriteFrame = null;
            if (frame) frame.destroy(); frame = null;
            display.destroy(); canvasNode.destroy();
        }
        scope.own(dispose);
        layout(logicalSize, displayRect, target); canvasNode.active = !!target;
        return {content, display, camera, layout, dispose, get ready() {return ready;},
            setActive(value) {if (!disposed) canvasNode.active = !!value && !!camera.targetTexture;},
            snapshot() {return {logicalSize:[canvasUI.width,canvasUI.height],pixels:camera.targetTexture?[camera.targetTexture.width,camera.targetTexture.height]:null,layer,priority:camera.priority,active:canvasNode.active,disposed,cameraEnabled:camera.enabledInHierarchy,cameraPosition:camera.node.worldPosition,contentPosition:content.worldPosition,displayPosition:display.worldPosition,trackedNodes:watched.size,readyFrames};},
        };
    }
    return {estimateTarget, createTarget, create};
}
Object.assign(api, {registerRenderSurface});

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

// Antialiased positive-width 2D lines. Feather geometry follows Godot 4.5.2
// renderer_canvas_cull.cpp (MIT; see NOTICE.godot.txt), without screen derivatives.
// Vertex payload's first channel is coverage, independent of Creator UIOpacity.
const DRAW_FEATHER = 1.25;
const drawAdd=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s];
const drawSub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const drawNormal=a=>[a[1],-a[0]];
const drawUnit=a=>{const l=Math.hypot(a[0],a[1]);return l?[a[0]/l,a[1]/l]:[0,0];};
const drawZero=a=>Math.abs(a[0])<1e-5&&Math.abs(a[1])<1e-5;
function drawValidate(points,width){
    if(!Number.isFinite(width)||width<=0||points.length<2||!points.every(p=>p.length===2&&p.every(Number.isFinite)))throw new Error('Invalid positive-width line');
}
function drawBuilder(){
    const vertices=[],coverage=[],indices=[];
    return {strip(points,alphas){const start=vertices.length/2;points.forEach((p,i)=>{vertices.push(...p);coverage.push(alphas[i],0,0);});for(let i=2;i<points.length;i++)indices.push(start+i-2,start+i-1,start+i);},quad(points,alphas){const start=vertices.length/2;points.forEach((p,i)=>{vertices.push(...p);coverage.push(alphas[i],0,0);});indices.push(start,start+1,start+2,start,start+2,start+3);},finish(){if(vertices.length/2>65535)throw new Error('Line mesh exceeds 16-bit indices');return {vertices:new Float32Array(vertices),source:new Float32Array(vertices.length),vertexData:new Float32Array(coverage),indices:new Uint16Array(indices)};}};
}
function featherLine(from,to,width){
    drawValidate([from,to],width);const b=drawBuilder(),diff=drawSub(from,to);
    if(drawZero(diff))return b.finish();
    const normal=drawNormal(drawUnit(diff)),extent=width*.5,borderSize=DRAW_FEATHER*Math.min(1,width),side=normal.map(v=>v*borderSize),cap=drawUnit(diff).map(v=>v*borderSize);
    const a=drawAdd(from,normal,extent),c=drawAdd(from,normal,-extent),d=drawAdd(to,normal,-extent),e=drawAdd(to,normal,extent);
    b.quad([a,c,d,e],[1,1,1,1]);
    b.quad([a,drawAdd(a,side),drawAdd(e,side),e],[1,0,0,1]);
    b.quad([c,drawAdd(c,side,-1),drawAdd(d,side,-1),d],[1,0,0,1]);
    b.quad([a,drawAdd(a,cap),drawAdd(c,cap),c],[1,0,0,1]);
    b.quad([e,drawAdd(e,cap,-1),drawAdd(d,cap,-1),d],[1,0,0,1]);
    for(const [p,s,t]of [[a,1,1],[c,-1,1],[e,1,-1],[d,-1,-1]])b.quad([p,drawAdd(p,cap,t),drawAdd(drawAdd(p,side,s),cap,t),drawAdd(p,side,s)],[1,0,0,0]);
    return b.finish();
}
function featherPolyline(points,width){
    drawValidate(points,width);const b=drawBuilder(),n=points.length,dirs=[];
    for(let i=1;i<n;i++)dirs.push(drawUnit(drawSub(points[i],points[i-1])));
    const first=dirs.find(d=>!drawZero(d));if(!first)return b.finish();const last=dirs.slice().reverse().find(d=>!drawZero(d));
    const loop=drawZero(drawSub(points[0],points[n-1])),offset=loop?0:2,count=n*2+(loop?0:4),sideCount=n*2+(loop?0:5),center=Array(count),left=Array(sideCount),right=Array(sideCount),ca=Array(count),la=Array(sideCount),ra=Array(sideCount),borderSize=DRAW_FEATHER*Math.min(1,width);
    let previous=[0,0];
    for(let i=0;i<n;i++){
        let segment=i===n-1?previous:dirs[i];if(drawZero(segment))segment=previous;
        if(loop&&i===0)previous=last;else if(loop&&i===n-1)previous=first;
        let base;
        if(!loop&&i===0)base=drawNormal(first);else if(!loop&&i===n-1)base=drawNormal(last);else {
            let bisector=drawUnit(drawSub(previous,segment)),length=1;
            const sine=Math.sin(Math.atan2(bisector[0]*previous[1]-bisector[1]*previous[0],bisector[0]*previous[0]+bisector[1]*previous[1]));
            if(Math.abs(sine)>=1e-5&&!drawZero(drawSub(segment,previous)))length=Math.max(-3,Math.min(3,1/sine));else bisector=drawNormal(segment);
            if(drawZero(bisector))bisector=drawNormal(segment);base=bisector.map(v=>v*length);
        }
        const p=points[i],edge=base.map(v=>v*width*.5),border=base.map(v=>v*borderSize),j=i*2+offset;
        center[j]=left[j]=drawAdd(p,edge);center[j+1]=right[j]=drawAdd(p,edge,-1);left[j+1]=drawAdd(center[j],border);right[j+1]=drawAdd(center[j+1],border,-1);
        ca[j]=ca[j+1]=la[j]=ra[j]=1;la[j+1]=ra[j+1]=0;
        if(!loop&&i===0){const cap=segment.map(v=>-v*borderSize);center[0]=left[0]=drawAdd(center[j],cap);center[1]=right[0]=drawAdd(center[j+1],cap);left[1]=drawAdd(left[0],border);right[1]=drawAdd(right[0],border,-1);ca[0]=ca[1]=la[0]=la[1]=ra[0]=ra[1]=0;}
        if(!loop&&i===n-1){const cap=previous.map(v=>v*borderSize),end=n*2+2;center[end]=drawAdd(center[j],cap);center[end+1]=drawAdd(center[j+1],cap);ca[end]=ca[end+1]=0;
            left[end]=center[j];left[end+1]=drawAdd(drawAdd(center[j],cap),border);left[end+2]=drawAdd(center[j],cap);la[end]=1;la[end+1]=la[end+2]=0;
            right[end]=center[j+1];right[end+1]=drawAdd(drawAdd(center[j+1],cap),border,-1);right[end+2]=drawAdd(center[j+1],cap);ra[end]=1;ra[end+1]=ra[end+2]=0;
        }
        previous=segment;
    }
    // Native commands render the body then the left and right feather strips.
    b.strip(center,ca);b.strip(left,la);b.strip(right,ra);return b.finish();
}
function mergeDrawingMeshes(meshes){
    const b={vertices:[],source:[],vertexData:[],indices:[]};
    for(const mesh of meshes){const offset=b.vertices.length/2;for(const key of ['vertices','source','vertexData'])for(const value of mesh[key])b[key].push(value);for(const index of mesh.indices)b.indices.push(index+offset);}
    if(b.vertices.length/2>65535)throw new Error('Drawing mesh exceeds 16-bit indices');
    return {vertices:new Float32Array(b.vertices),source:new Float32Array(b.source),vertexData:new Float32Array(b.vertexData),indices:new Uint16Array(b.indices)};
}
// Godot 4.5.2 renderer_canvas_cull.cpp canvas_item_add_circle (MIT).
// Filled non-antialiased 64-segment fan; the repeated last point and centre
// match the native command, with feathering left to the caller when needed.
function filledCircle(at,radius){
    if(at.length!==2||!at.every(Number.isFinite)||!Number.isFinite(radius)||radius<0)throw new Error('Invalid filled circle');
    const vertices=new Float32Array(66*2),vertexData=new Float32Array(66*3),indices=new Uint16Array(64*3);
    for(let i=0;i<65;i++){const a=Math.fround(i*Math.fround(Math.PI*2/64));vertices[i*2]=at[0]+Math.cos(a)*radius;vertices[i*2+1]=at[1]+Math.sin(a)*radius;vertexData[i*3]=1;}
    vertices[130]=at[0];vertices[131]=at[1];vertexData[195]=1;
    for(let i=0;i<64;i++)indices.set([65,i,i+1],i*3);
    return {vertices,source:new Float32Array(vertices.length),vertexData,indices};
}
Object.assign(api,{featherLine,featherPolyline,mergeDrawingMeshes,filledCircle});

// Rounded fill/border tessellation follows Godot 4.5.2 StyleBoxFlat (MIT;
// NOTICE.godot.txt). Supports four radii/borders, center, AA and corner detail.
// Shadow, skew and blended borders are outside this explicit API.
function roundedStyleBox(rect,options={}) {
    const four=(value,defaultValue)=>Array.isArray(value)?value.slice():Array(4).fill(value??defaultValue);
    const radii=four(options.radius,0),border=four(options.borderWidth,0),fill=options.fill??[.6,.6,.6,1],outline=options.border??[.8,.8,.8,1],detail=options.cornerDetail??8,aa=options.aaSize??1,center=options.drawCenter!==false;
    if(rect.length!==4||rect.some(v=>!Number.isFinite(v))||rect[2]<0||rect[3]<0||[radii,border].some(v=>v.length!==4||v.some(n=>!Number.isFinite(n)||n<0))||[fill,outline].some(c=>c.length!==4||c.some(n=>!Number.isFinite(n)||n<0||n>1))||!Number.isInteger(detail)||detail<1||detail>20||!Number.isFinite(aa)||aa<0)throw new Error('Invalid rounded style box');
    const vertices=[],rgb=[],uv=[],indices=[];
    const finish=()=>({vertices:new Float32Array(vertices),source:new Float32Array(vertices.length),vertexData:new Float32Array(rgb),vertexUV:new Float32Array(uv),indices:new Uint16Array(indices)});
    if(!rect[2]||!rect[3]||(!center&&!border.some(n=>n>0)))return finish();
    const grow=(r,b)=>[r[0]-b[0],r[1]-b[1],r[2]+b[0]+b[2],r[3]+b[1]+b[3]],map=(a,f)=>a.map(f),adaptedBorder=Array(4).fill(1e6),adaptedRadius=Array(4).fill(1e6);
    const adapt=(a,b,result,values,width,maxA,maxB)=>{const factor=Math.min(1,width/(values[a]+values[b]));result[a]=Math.min(values[a]*factor,maxA,result[a]);result[b]=Math.min(values[b]*factor,maxB,result[b]);};
    adapt(1,3,adaptedBorder,border,rect[3],rect[3],rect[3]);adapt(0,2,adaptedBorder,border,rect[2],rect[2],rect[2]);
    adapt(1,2,adaptedRadius,radii,rect[3],rect[3]-adaptedBorder[3],rect[3]-adaptedBorder[1]);adapt(0,3,adaptedRadius,radii,rect[3],rect[3]-adaptedBorder[3],rect[3]-adaptedBorder[1]);
    adapt(0,1,adaptedRadius,radii,rect[2],rect[2]-adaptedBorder[2],rect[2]-adaptedBorder[0]);adapt(3,2,adaptedRadius,radii,rect[2],rect[2]-adaptedBorder[2],rect[2]-adaptedBorder[0]);
    const hasBorder=border.some(n=>n>0),aaOn=options.antialiased!==false&&aa>0&&radii.some(n=>n>0),infill=grow(rect,map(adaptedBorder,n=>-n)),style=aaOn?grow(rect,map(border,n=>n>0?-aa:0)):rect;
    function corners(r){
        const b=[r[0]-style[0],r[1]-style[1],style[2]-r[2]-(r[0]-style[0]),style[3]-r[3]-(r[1]-style[1])];
        const cr=[Math.max(adaptedRadius[0]-Math.min(b[1],b[0]),0),Math.max(adaptedRadius[1]-Math.min(b[1],b[2]),0),Math.max(adaptedRadius[2]-Math.min(b[3],b[2]),0),Math.max(adaptedRadius[3]-Math.min(b[3],b[0]),0)];
        const overflow=[Math.max(0,cr[0]+cr[3]-r[3]),Math.max(0,cr[0]+cr[1]-r[2]),Math.max(0,cr[1]+cr[2]-r[3]),Math.max(0,cr[3]+cr[2]-r[2])],hs=b[0]+b[2],vs=b[1]+b[3],ratio=[hs>0?b[0]/hs:0,vs>0?b[1]/vs:0,hs>0?b[2]/hs:0,vs>0?b[3]/vs:0];
        const reduction=[[overflow[1]*ratio[0],overflow[0]*ratio[1]],[overflow[1]*ratio[2],overflow[2]*ratio[1]],[overflow[3]*ratio[2],overflow[2]*ratio[3]],[overflow[3]*ratio[0],overflow[0]*ratio[3]]],left=reduction.map((v,i)=>v.map(n=>Math.max(0,n-cr[i]))),distributed=reduction.map((v,i)=>v.map((n,j)=>Math.max(0,cr[i]-n-left[(i+1)%4][j]-left[(i+3)%4][j]))),scale=distributed.map((v,i)=>v.map((n,j)=>n/Math.max(1.1920928955078125e-7,cr[i]-Math.max(0,left[(i+1)%4][j]+left[(i+3)%4][j]-n))));
        const centers=[[r[0]+cr[0]*scale[0][0],r[1]+cr[0]*scale[0][1]],[r[0]+r[2]-cr[1]*scale[1][0],r[1]+cr[1]*scale[1][1]],[r[0]+r[2]-cr[2]*scale[2][0],r[1]+r[3]-cr[2]*scale[2][1]],[r[0]+cr[3]*scale[3][0],r[1]+r[3]-cr[3]*scale[3][1]]];
        return {cr,scale,centers};
    }
    function rounded(ring,inner,innerColor,outerColor,filled=false){
        const start=vertices.length/2,steps=adaptedRadius.some(n=>n>0)?detail:1,a=corners(inner),b=corners(ring),add=(set,i,angle,color)=>{vertices.push(set.centers[i][0]+set.cr[i]*Math.cos(angle)*set.scale[i][0],set.centers[i][1]+set.cr[i]*Math.sin(angle)*set.scale[i][1]);rgb.push(...color.slice(0,3));uv.push(color[3],0);};
        for(let i=0;i<4;i++)for(let j=0;j<=steps;j++){const angle=(i+j/steps)*Math.PI/2+Math.PI;add(a,i,angle,innerColor);if(!filled)add(b,i,angle,outerColor);}
        const count=vertices.length/2-start;
        if(!filled){for(let i=0;i<count;i++)indices.push(start+i,start+(i+2)%count,start+(i+1)%count);}
        else{for(let i=0;i<count/2-1;i++)indices.push(start+i,start+count-2-i,start+i+1,start+i,start+count-1-i,start+count-2-i);}
    }
    const transparent=c=>[c[0],c[1],c[2],0];
    if(!aaOn){if(hasBorder)rounded(style,infill,outline,outline);if(center)rounded(infill,infill,fill,fill,true);}
    else {
        const borderAA=map(border,n=>hasBorder&&n>0?aa:0),fillAA=map(border,n=>!hasBorder||n===0?aa:0),half=a=>map(a,n=>n*.5),negative=a=>map(a,n=>-n);
        if(center){const clear=grow(infill,half(fillAA)),solid=grow(clear,negative(fillAA));rounded(solid,solid,fill,fill,true);rounded(clear,solid,fill,transparent(fill));}
        if(hasBorder){const innerSolid=grow(infill,half(borderAA)),innerClear=grow(innerSolid,negative(borderAA)),outerClear=grow(rect,half(borderAA)),outerSolid=grow(style,half(borderAA));rounded(outerSolid,innerSolid,outline,outline);rounded(innerSolid,innerClear,center?fill:transparent(outline),outline);rounded(outerClear,outerSolid,outline,transparent(outline));}
    }
    if(vertices.length/2>65535)throw new Error('Style box exceeds 16-bit indices');return finish();
}
Object.assign(api,{roundedStyleBox});

// PCG32 XSH-RR, adapted from the pinned Godot4.5.2 implementation.
// (c)2014 M.E. O'Neill, Apache-2.0; full notice in NOTICE.godot.txt.
// Two exact uint32 words avoid requiring BigInt on mini-game runtimes.
api.PCG32 = class PCG32 {
    constructor(seed = 0) { this.seed(seed); }
    seed(value) {
        if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('PCG seed requires a nonnegative safe integer');
        this.low = 0; this.high = 0;
        this.next();
        const low = value >>> 0, sum = this.low + low;
        this.high = (this.high + Math.floor(value / 4294967296) + (sum >= 4294967296 ? 1 : 0)) >>> 0;
        this.low = sum >>> 0;
        this.next();
        return this;
    }
    next() {
        const low = this.low, high = this.high;
        const a = low & 65535, b = low >>> 16;
        const c = 0x4c957f2d & 65535, d = 0x4c957f2d >>> 16;
        const middle = Math.floor(a * c / 65536) + b * c + a * d;
        const carryProduct = (b * d + Math.floor(middle / 65536)) >>> 0;
        const productLow = Math.imul(low, 0x4c957f2d) >>> 0;
        const sum = productLow + 0xeecf029f;
        this.low = sum >>> 0;
        this.high = (carryProduct + Math.imul(low, 0x5851f42d) + Math.imul(high, 0x4c957f2d) + 0x280af6fd + (sum >= 4294967296 ? 1 : 0)) >>> 0;
        const shiftedLow = (low >>> 18) | (high << 14);
        const xorLow = shiftedLow ^ low, xorHigh = (high >>> 18) ^ high;
        const output = (xorLow >>> 27) | (xorHigh << 5), rotation = high >>> 27;
        return ((output >>> rotation) | (output << ((-rotation) & 31))) >>> 0;
    }
    bounded(bound) {
        if (!Number.isInteger(bound) || bound < 1 || bound > 4294967296) throw new RangeError('PCG bound requires1..2^32');
        if (bound === 4294967296) return this.next();
        const threshold = ((-bound) >>> 0) % bound;
        for (;;) { const value = this.next(); if (value >= threshold) return value % bound; }
    }
    range(from, to) {
        if (![from,to].every(v => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647)) throw new RangeError('PCG range requires signed32-bit endpoints');
        if (from === to) return from;
        const minimum = Math.min(from,to);
        return minimum + this.bounded(Math.max(from,to) - minimum + 1);
    }
};

// Lossless eight-bit coverage planes. No browser, Node or platform globals.
// Bounded inflation and zlib checksums reject corrupt hit/shadow data.
const alphaBase64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function alphaBase64(text, maxBytes) {
    if (typeof text !== 'string' || !text.length || text.length % 4 || text.length > Math.ceil(maxBytes / 3) * 4) throw new Error('Invalid alpha base64 length');
    const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
    const bytes = new Uint8Array(text.length / 4 * 3 - padding);
    let output = 0;
    for (let i = 0; i < text.length; i += 4) {
        let word = 0;
        for (let j = 0; j < 4; j++) {
            const char = text[i + j], at = i + j;
            const value = char === '=' && at >= text.length - padding ? 0 : alphaBase64Alphabet.indexOf(char);
            if (value < 0) throw new Error('Invalid alpha base64 character');
            word = word * 64 + value;
        }
        if (output < bytes.length) bytes[output++] = word >>> 16;
        if (output < bytes.length) bytes[output++] = word >>> 8;
        if (output < bytes.length) bytes[output++] = word;
    }
    return bytes;
}
function decodeAlphaMasks(payload, maxPixels = 64 * 1024 * 1024) {
    if (!payload || payload.schema !== 2 || payload.encoding !== 'zlib-u8-base64' || !payload.masks || typeof payload.masks !== 'object' || Array.isArray(payload.masks)) throw new Error('Unsupported alpha mask format');
    if (!Number.isSafeInteger(maxPixels) || maxPixels <= 0 || maxPixels > 64 * 1024 * 1024) throw new Error('Invalid alpha allocation limit');
    const entries = Object.entries(payload.masks), result = new Map();
    if (entries.length > 128) throw new Error('Too many alpha masks');
    let total = 0;
    for (const [key, mask] of entries) {
        if (!mask || !Array.isArray(mask.size) || mask.size.length !== 2 || !mask.size.every(n => Number.isSafeInteger(n) && n > 0) || !Array.isArray(mask.origin) || mask.origin.length !== 2 || !mask.origin.every(Number.isSafeInteger)) throw new Error('Invalid alpha dimensions');
        const count = mask.size[0] * mask.size[1];
        if (!Number.isSafeInteger(count) || (total += count) > maxPixels) throw new Error('Alpha allocation exceeds limit');
        const compressed = alphaBase64(mask.data, count * 2 + 1024);
        const data = new Uint8Array(count), inflater = new alphaInflate.Inflate({chunkSize: 32768, windowBits: 15});
        let written = 0;
        inflater.onData = chunk => {
            if (written + chunk.length > count) throw new Error('Alpha output exceeds dimensions');
            data.set(chunk, written); written += chunk.length;
        };
        inflater.push(compressed, true);
        if (inflater.err || !inflater.ended || written !== count || inflater.strm.avail_in !== 0) throw new Error('Corrupt or truncated alpha data');
        result.set(key, {size: mask.size.slice(), origin: mask.origin.slice(), data});
    }
    return result;
}
function alphaSample(mask, x, y) {
    const px = x - mask.origin[0], py = y - mask.origin[1];
    // This also rejects NaN/infinity. Accepted coordinates are nonnegative and
    // below the validated 64 Mi-pixel limit, so truncation is exact floor.
    if (!(px >= 0 && py >= 0 && px < mask.size[0] && py < mask.size[1])) return 0;
    return mask.data[(py | 0) * mask.size[0] + (px | 0)] / 255;
}
function alphaBounds(mask, rect) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const startX = Math.max(Math.floor(rect[0]), mask.origin[0]), endX = Math.min(Math.ceil(rect[0] + rect[2]), mask.origin[0] + mask.size[0]);
    for (let y = Math.max(Math.floor(rect[1]), mask.origin[1]); y < Math.min(Math.ceil(rect[1] + rect[3]), mask.origin[1] + mask.size[1]); y++) {
        const row = (y - mask.origin[1]) * mask.size[0];
        for (let x = startX; x < endX; x++) if (mask.data[row + x - mask.origin[0]] > 0) {
            left = Math.min(left, Math.max(x, rect[0])); right = Math.max(right, Math.min(x + 1, rect[0] + rect[2])); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        }
    }
    return Number.isFinite(left) ? [left, top, right - left, bottom - top] : [rect[0], rect[1], 0, 0];
}
api.decodeAlphaMasks = decodeAlphaMasks;
api.alphaSample = alphaSample;
api.alphaBounds = alphaBounds;

Object.defineProperty(root, 'LittleStepsCore', {value: Object.freeze(api), writable: false, configurable: false});
})(globalThis);
