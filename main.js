const log = document.getElementById("log");
const canvas = document.getElementById("canvas");
const intensitySlider = document.getElementById("intensity");
let device, context, format, pipeline, bindGroup, uniformBuffer, texture, sampler;
let canvasSize = [0, 0];
let isInitialized = false; // Track initialization state

function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  canvasSize = [canvas.width, canvas.height];
  if (isInitialized) updateUniforms(parseFloat(intensitySlider.value)); // Only update if initialized
}

async function initWebGPU() {
  try {
    if (!navigator.gpu) {
      logMsg("❌ WebGPU no disponible. Usa Chrome 113+ con HTTPS/localhost.");
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      logMsg("❌ No se pudo obtener el adaptador WebGPU.");
      return false;
    }

    device = await adapter.requestDevice();
    context = canvas.getContext("webgpu");
    if (!context) {
      logMsg("❌ No se pudo obtener el contexto WebGPU.");
      return false;
    }

    format = navigator.gpu.getPreferredCanvasFormat();
    resizeCanvas();
    context.configure({
      device,
      format,
      alphaMode: "opaque"
    });

    sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear"
    });

    uniformBuffer = device.createBuffer({
      size: 32, // 4 (intensity) + 8 (resolution) + 16 (padding vec4f)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const shaderCode = `
struct Uniforms {
  intensity: f32,
  resolution: vec2f,
  padding: vec4f // 16 bytes for alignment
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
  let aspect = uniforms.resolution.x / uniforms.resolution.y;
  let adjustedUV = vec2f(uv.x * aspect, uv.y);
  let center = vec2f(0.5 * aspect, 0.5);
  let offset = adjustedUV - center;
  let dist = length(offset);
  let strength = uniforms.intensity * 0.1;
  // Avoid division by zero in normalize by adding a small epsilon
  let safeOffset = select(offset, vec2f(0.001), dist < 0.0001);
  let distortedUV = adjustedUV + normalize(safeOffset) * sin(dist * 10.0) * strength;
  let clampedUV = clamp(distortedUV, vec2f(0.0), vec2f(1.0 * aspect, 1.0));
  return textureSample(img, smp, clampedUV);
}
`;

    const shaderModule = device.createShaderModule({ code: shaderCode });
    // Check if shader module creation failed
    if (!shaderModule) {
      logMsg("❌ Error: No se pudo crear el módulo de shader.");
      return false;
    }

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

    if (!pipeline) {
      logMsg("❌ Error: No se pudo crear el pipeline de renderizado.");
      return false;
    }

    logMsg("✅ WebGPU inicializado.");
    isInitialized = true; // Mark as initialized
    return true;
  } catch (err) {
    logMsg("❌ ERROR initWebGPU: " + err.message);
    return false;
  }
}

async function loadImageToTexture(fileOrUrl) {
  try {
    if (!isInitialized || !pipeline) {
      logMsg("⚠️ WebGPU no está inicializado correctamente.");
      return;
    }

    let bitmap;
    if (typeof fileOrUrl === "string") {
      const response = await fetch(fileOrUrl, { mode: "cors" });
      if (!response.ok) throw new Error(`No se pudo cargar la imagen: ${response.status}`);
      const blob = await response.blob();
      bitmap = await createImageBitmap(blob);
    } else {
      bitmap = await createImageBitmap(fileOrUrl);
    }

    logMsg(`🖼️ Imagen cargada: ${bitmap.width}x${bitmap.height}`);

    texture = device.createTexture({
      size: [bitmap.width, bitmap.height, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: true },
      { texture },
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

    logMsg("✅ Textura lista.");
    render();
  } catch (err) {
    logMsg("❌ ERROR imagen: " + err.message);
  }
}

function updateUniforms(intensity) {
  if (!isInitialized || !uniformBuffer) {
    logMsg("⚠️ Uniform buffer no está inicializado.");
    return;
  }
  const array = new Float32Array([intensity, canvasSize[0], canvasSize[1], 0, 0, 0, 0]);
  device.queue.writeBuffer(uniformBuffer, 0, array);
  logMsg(`🎚️ Intensidad: ${intensity}`);
}

function render() {
  try {
    if (!texture || !bindGroup) {
      logMsg("⚠️ Textura no cargada.");
      return;
    }

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
  } catch (err) {
    logMsg("❌ ERROR render: " + err.message);
  }
}

document.getElementById("imageUpload").addEventListener("change", (e) => {
  if (e.target.files[0]) {
    loadImageToTexture(e.target.files[0]);
  }
});

intensitySlider.addEventListener("input", (e) => {
  updateUniforms(parseFloat(e.target.value));
  render();
});

window.addEventListener("resize", () => {
  resizeCanvas();
  if (isInitialized) render();
});

async function loadDefaultImage() {
  const defaultImageUrl = "https://picsum.photos/512/512";
  await loadImageToTexture(defaultImageUrl);
}

initWebGPU().then((success) => {
  if (success) {
    resizeCanvas();
    updateUniforms(parseFloat(intensitySlider.value));
    loadDefaultImage();
  }
});