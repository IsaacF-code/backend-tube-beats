import Fastify from "fastify";

const app = Fastify({
    ajv: {
        customOptions: {
            coerceTypes: false // Desabilita a coerção de tipos para evitar que o Fastify converta automaticamente os tipos de dados recebidos na requisição. 
        }
    }
});

function isYouTubeUrl(url: string): boolean {
    const parsedUrl = new URL(url);
    
    return (
        parsedUrl.hostname === "youtube.com" ||
        parsedUrl.hostname === "www.youtube.com" ||
        parsedUrl.hostname === "youtu.be"
    )
}

type VideoBodyRequest = {
    url: string;
};

app.get("/api/health", async () => {
  return {
    status: "ok"
  };
});

app.post<{ Body: VideoBodyRequest }>("/api/video/info", {
    schema: {
        body: {
            type: "object",
            required: ["url"],
            properties: {
                url: { 
                    type: "string",
                    format: "uri"
                }
            }
        }
    }    
}, async (request, reply) => {
  const isYoutube = isYouTubeUrl(request.body.url);

  if (!isYoutube) {
    return reply.status(400).send({
        error: "A URL fornecida precisa ser do YouTube."
    });
  }

  console.log(isYoutube);

  return {
    message: "Recebi os dados!",
    data: request.body.url,
    isYoutube
  };
});

app.listen({ port: 3000 }, () => {
  console.log("Servidor rodando em http://localhost:3000");
});