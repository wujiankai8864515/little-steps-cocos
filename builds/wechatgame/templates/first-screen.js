// Native WeChat loading before SystemJS/engine startup. One draw, no logo,
// images, fonts, downloads, timer loop or new 2D context on the game canvas.
let gl, program, buffer, progress = 0, ready;
function draw() {
    if (!gl || !program) return;
    gl.viewport(0, 0, window.canvas.width, window.canvas.height);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(program, 'progress'), progress);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function start(alpha, antialias, useWebgl2) {
    if (ready) return ready;
    const options = {alpha: alpha === 'true', antialias: antialias !== 'false', depth: true, stencil: true};
    const gl2 = useWebgl2 === 'true' && window.canvas.getContext('webgl2', options);
    gl = gl2 || window.canvas.getContext('webgl', options);
    window.WebGL2RenderingContext = !!gl2;
    if (!gl) return ready = Promise.reject(new Error('WebGL unavailable for loading'));
    let vs = 'attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}';
    let fs = `precision mediump float;varying vec2 uv;uniform float progress;
    void main(){
      float glow=max(0.,1.-length((uv-vec2(.5,.52))*vec2(1.5,1.1)));
      vec3 color=mix(vec3(.974,.865,.677),vec3(.999,.958,.845),glow*glow);
      vec2 p=vec2(uv.x,1.-uv.y);
      if(p.y>.728&&p.y<.744&&p.x>.253&&p.x<.747){
        color=vec3(.86,.76,.58);if(p.x<.253+.494*progress)color=vec3(.87,.65,.25);
      }
      gl_FragColor=vec4(color,1.);
    }`;
    if (gl2) {
        vs = '#version 300 es\n' + vs.replace('attribute', 'in').replace('varying', 'out');
        fs = '#version 300 es\n' + fs.replace('varying', 'in').replace('uniform float progress;', 'uniform float progress;out vec4 fragColor;').replace('gl_FragColor', 'fragColor');
    }
    function shader(type, source) {
        const item = gl.createShader(type);gl.shaderSource(item, source);gl.compileShader(item);
        if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
        return item;
    }
    const vertex = shader(gl.VERTEX_SHADER, vs), fragment = shader(gl.FRAGMENT_SHADER, fs);
    program = gl.createProgram();gl.attachShader(program, vertex);gl.attachShader(program, fragment);gl.linkProgram(program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    buffer = gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER, buffer);gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    draw();console.info('[LittleSteps] NATIVE_LOADING_FIRST_DRAW ' + Date.now());
    return ready = Promise.resolve();
}
function setProgress(value) {progress=Math.min(.99,Math.max(0,value));draw();return Promise.resolve();}
function end() {
    if (gl) {gl.useProgram(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.deleteBuffer(buffer);gl.deleteProgram(program);}
    program=null;buffer=null;return Promise.resolve();
}
module.exports = {start, setProgress, end};
