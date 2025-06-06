
const log = document.getElementById("log");
function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

const canvas = document.getElementById("canvas");
const intensitySlider = document.getElementById("intensity");
let device, context, format, pipeline, bindGroup, uniformBuffer, texture, sampler;
let canvasSize = [0, 0];
let textureSize = [1, 1];

async function initWebGPU() {
  const adapter = await navigator.gpu.requestAdapter();
  device = await adapter.requestDevice();
  context = canvas.getContext("webgpu");
  format = navigator.gpu.getPreferredCanvasFormat();

  resizeCanvas();
  context.configure({
    device,
    format,
    alphaMode: "opaque"
  });

  sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  uniformBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const shaderModule = device.createShaderModule({
    code: `
      struct Uniforms {
        intensity: f32,
        resolution: vec2f,
        textureSize: vec2f
      };
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var img: texture_2d<f32>;
      @group(0) @binding(2) var smp: sampler;

      @vertex
      fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
        var pos = array<vec2f, 6>(
          vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
          vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
        );
        return vec4f(pos[i], 0.0, 1.0);
      }

      @fragment
      fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
        let uv = pos.xy / uniforms.resolution;
        let center = vec2f(0.5, 0.5);
        let offset = uv - center;
        let dist = length(offset);
        let strength = uniforms.intensity;
        let distortedUV = uv + normalize(offset) * sin(dist * 40.0) * strength * 0.05;
        return textureSample(img, smp, distortedUV);
      }
    `
  });

  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: {
      module: shaderModule,
      entryPoint: "fs",
      targets: [{ format }]
    },
    primitive: { topology: "triangle-list" }
  });

  logMsg("✅ WebGPU inicializado.");
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  canvasSize = [canvas.width, canvas.height];
}

function updateUniforms(intensity) {
  const array = new Float32Array([intensity, ...canvasSize, ...textureSize]);
  device.queue.writeBuffer(uniformBuffer, 0, array.buffer);
}

async function loadImageToTexture(file) {
  const bitmap = await createImageBitmap(file);
  textureSize = [bitmap.width, bitmap.height];
  logMsg("🖼️ Imagen cargada: " + bitmap.width + "x" + bitmap.height);

  texture = device.createTexture({
    size: textureSize,
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    textureSize
  );

  bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler }
    ]
  });

  logMsg("✅ Textura lista.");
  updateUniforms(parseFloat(intensitySlider.value));
  render();
}

function render() {
  if (!texture || !bindGroup) return;

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: "clear",
      storeOp: "store"
    }]
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();

  device.queue.submit([encoder.finish()]);
  logMsg("✅ Imagen renderizada.");
}

document.getElementById("imageUpload").addEventListener("change", (e) => {
  if (e.target.files[0]) {
    loadImageToTexture(e.target.files[0]);
  }
});

intensitySlider.addEventListener("input", (e) => {
  document.getElementById("intensityValue").textContent = e.target.value;
  updateUniforms(parseFloat(e.target.value));
  render();
});

window.addEventListener("resize", () => {
  resizeCanvas();
  updateUniforms(parseFloat(intensitySlider.value));
  render();
});

initWebGPU().then(() => {
  resizeCanvas();
  updateUniforms(parseFloat(intensitySlider.value));
});
