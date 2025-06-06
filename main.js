const log = document.getElementById("log");

function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

async function init() {
  try {
    logMsg("Comprobando soporte WebGPU...");
    if (!navigator.gpu) {
      logMsg("❌ WebGPU no disponible. Usa Chrome 113+ con WebGPU habilitado y un contexto seguro (HTTPS/localhost).");
      return;
    }

    logMsg("Solicitando adaptador WebGPU...");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      logMsg("❌ No se pudo obtener el adaptador WebGPU.");
      return;
    }

    logMsg("Solicitando dispositivo WebGPU...");
    const device = await adapter.requestDevice();
    if (!device) {
      logMsg("❌ No se pudo obtener el dispositivo WebGPU.");
      return;
    }

    logMsg("Configurando canvas...");
    const canvas = document.getElementById("canvas");
    if (!canvas) {
      logMsg("❌ No se encontró el elemento <canvas id='canvas'>.");
      return;
    }

    // Set canvas size explicitly
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    logMsg(`Canvas configurado: ${canvas.width}x${canvas.height}`);

    logMsg("Obteniendo contexto WebGPU...");
    const context = canvas.getContext("webgpu");
    if (!context) {
      logMsg("❌ No se pudo obtener el contexto WebGPU.");
      return;
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    logMsg(`Formato de canvas preferido: ${format}`);

    logMsg("Configurando contexto WebGPU...");
    context.configure({
      device,
      format,
      alphaMode: "opaque"
    });

    logMsg("Creando módulo de shader...");
    const shaderModule = device.createShaderModule({
      code: `
        struct VertexOut {
          @builtin(position) Position : vec4<f32>,
        };

        @vertex
        fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
          var pos = array<vec2<f32>, 6>(
            vec2<f32>(-1.0, -1.0),
            vec2<f32>(1.0, -1.0),
            vec2<f32>(-1.0, 1.0),
            vec2<f32>(-1.0, 1.0),
            vec2<f32>(1.0, -1.0),
            vec2<f32>(1.0, 1.0)
          );
          var output : VertexOut;
          output.Position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
          return output;
        }

        @fragment
        fn fs() -> @location(0) vec4<f32> {
          return vec4<f32>(0.0, 0.3, 1.0, 1.0); // Azul
        }
      `
    });

    logMsg("Creando pipeline de renderizado...");
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vs"
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs",
        targets: [{ format }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });

    logMsg("Iniciando renderizado...");
    function render() {
      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const renderPassDescriptor = {
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }]
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(pipeline);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.end();

      device.queue.submit([commandEncoder.finish()]);
      logMsg("Frame renderizado.");
    }

    render();
    logMsg("✅ Render azul completado.");

    // Optional animation loop for continuous rendering
    // function frame() {
    //   render();
    //   requestAnimationFrame(frame);
    // }
    // requestAnimationFrame(frame);
  } catch (err) {
    logMsg("❌ ERROR: " + err.message);
  }
}

init();