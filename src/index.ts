import Fastify from "fastify";
import { spawn } from "node:child_process"; 

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

type VideoInfo = {
    title: string;
    duration: number;
    thumbnail: string;
}

function getVideoInfo(url: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
    
        const ytDlpProcess = spawn("yt-dlp", ["--dump-single-json",
            url
        ]);

        let output = "";
        let errorOutput = "";

        ytDlpProcess.stdout.on("data", (data) => {
            output += data.toString();
        })

        ytDlpProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        })

        ytDlpProcess.on("close", (code) => {
            if (code === 0) {
                resolve(JSON.parse(output) as VideoInfo);
            } else {
                reject(new Error(errorOutput));
            }
        })

    })
};

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

  try {
    const videoData = await getVideoInfo(request.body.url);

    console.log(videoData.title);
    console.log(videoData.duration);
    console.log(videoData.thumbnail);
    console.log(isYoutube);

    return {
        message: "Informações encontradas!",
        data: videoData,
        isYoutube
    };
  } catch (error) {
    console.error(error);

    return reply.status(502).send({
        error: "Não foi possível obter as informações do vídeo. Verifique se a URL é válida e tente novamente."
    });
  }

});

app.listen({ port: 3000 }, () => {
  console.log("Servidor rodando em http://localhost:3000");
});