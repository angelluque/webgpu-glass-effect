const log = document.getElementById("log");

function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

async function init() {
  try {
    if (!navigator.gpu) {
      logMsg("WebGPU no disponible. Asegúrate de usar un navegador compatible (Chrome 113+ con WebGPU habilitado) y un contexto seguro (HTTPS/localhost).");
      return;
    }

    logMsg("Inicializando WebGPU...");

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      logMsg("No se pudo obtener el adaptador WebGPU.");
      return;
    }

    const device = await adapter.requestDevice();
    const canvas = document.getElementById("canvas");
    
    // Set canvas size to match its display size
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const context = canvas.getContext("webgpu");
    if (!context) {
      logMsg("No se pudo obtener el contexto WebGPU.");
      return;
    }

    const format = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
      device,
      format,
      alphaMode: "opaque"
    });

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
    }

    // Initial render
    render();
    logMsg("✅ Render azul completado.");

    // Optional: Animation loop for continuous rendering
    function frame() {
      render();
      requestAnimationFrame(frame);
    }
    // Uncomment to enable animation loop
    // requestAnimationFrame(frame);
  } catch (err) {
    logMsg("❌ ERROR: " + err.message);
  }
}

init();