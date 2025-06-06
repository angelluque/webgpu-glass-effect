
const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl');
const input = document.getElementById('imgInput');

let texture, imageLoaded = false;

function compileShader(source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(shader));
  }
  return shader;
}

const vsSource = \`
attribute vec2 position;
varying vec2 vTexCoord;
void main() {
  vTexCoord = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
\`;

const fsSource = \`
precision mediump float;
uniform sampler2D uImage;
uniform float uTime;
varying vec2 vTexCoord;
void main() {
  vec2 offset = vec2(sin(vTexCoord.y * 40.0 + uTime) * 0.01, cos(vTexCoord.x * 40.0 + uTime) * 0.01);
  vec4 color = texture2D(uImage, vTexCoord + offset);
  gl_FragColor = color;
}
\`;

const program = gl.createProgram();
gl.attachShader(program, compileShader(vsSource, gl.VERTEX_SHADER));
gl.attachShader(program, compileShader(fsSource, gl.FRAGMENT_SHADER));
gl.linkProgram(program);
gl.useProgram(program);

const positionLocation = gl.getAttribLocation(program, 'position');
const uImageLocation = gl.getUniformLocation(program, 'uImage');
const uTimeLocation = gl.getUniformLocation(program, 'uTime');

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1, 1, -1, -1, 1,
  -1, 1, 1, -1, 1, 1
]), gl.STATIC_DRAW);

gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

function createTexture(image) {
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  imageLoaded = true;
}

input.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    createTexture(img);
  };
  img.src = URL.createObjectURL(file);
});

let start = Date.now();

function render() {
  requestAnimationFrame(render);
  if (!imageLoaded) return;
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1i(uImageLocation, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1f(uTimeLocation, (Date.now() - start) * 0.002);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

render();
