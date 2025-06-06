
const log = document.getElementById("log");
const canvas = document.getElementById("canvas");
const intensitySlider = document.getElementById("intensity");
let device, context, format, pipeline, bindGroup, uniformBuffer, texture, sampler;

function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

async function initWebGPU() {
  if (!navigator.gpu) {
    logMsg("WebGPU no disponible.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  device = await adapter.requestDevice();
  context = canvas.getContext("webgpu");
  format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  uniformBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear'
  });

  const module = device.createShaderModule({
    code: \`
      struct Uniforms {
        intensity: f32,
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
        let uv = pos.xy / vec2f(1280.0, 720.0); // ajustar según canvas
        let center = vec2f(0.5, 0.5);
        let offset = uv - center;
        let dist = length(offset);
        let strength = uniforms.intensity;
        let distortedUV = uv + normalize(offset) * sin(dist * 40.0) * strength * 0.05;
        return textureSample(img, smp, distortedUV);
      }
    \`
  });

  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: {
      module, entryPoint: "fs",
      targets: [{ format }]
    },
    primitive: { topology: "triangle-list" }
  });

  render();
}

function updateIntensity(value) {
  const array = new Float32Array([parseFloat(value)]);
  device.queue.writeBuffer(uniformBuffer, 0, array.buffer);
  render();
}

async function loadImageToTexture(file) {
  const bitmap = await createImageBitmap(file);
  texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });
  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture: texture },
    [bitmap.width, bitmap.height]
  );

  bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler }
    ]
  });

  render();
}

function render() {
  if (!texture || !bindGroup) return;

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: "clear",
      storeOp: "store"
    }]
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();

  device.queue.submit([encoder.finish()]);
}

document.getElementById("imageUpload").addEventListener("change", (e) => {
  if (e.target.files[0]) {
    loadImageToTexture(e.target.files[0]);
  }
});

intensitySlider.addEventListener("input", (e) => {
  updateIntensity(e.target.value);
});

initWebGPU();
