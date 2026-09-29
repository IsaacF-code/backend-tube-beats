import Fastify from "fastify";
import { spawn } from "node:child_process"; 
import cors from "@fastify/cors";
import path from "node:path";
import fs from "node:fs";

const app = Fastify({
    ajv: {
        customOptions: {
            coerceTypes: false // Desabilita a coerção de tipos para evitar que o Fastify converta automaticamente os tipos de dados recebidos na requisição. 
        }
    }
});

await app.register(cors, {
    origin: "http://localhost:5173",
    exposedHeaders: ["Content-Disposition"]
})

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
                const video = JSON.parse(output);
                resolve({
                    title: video.title,
                    duration: video.duration,
                    thumbnail: video.thumbnail
                });
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

async function downloadAudio(url: string): Promise<string> {
    const downloadsDir = path.resolve("downloads"); 
    fs.mkdirSync(downloadsDir, {recursive: true});

    const outputPath = path.join(downloadsDir, "%(title)s.%(ext)s");

    const ytDlpProcess = spawn("yt-dlp", [
        "-x",
        "--audio-format", "mp3",
        "-o", outputPath,
        "--print", "after_move:filepath",
        url
    ], {
        env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8"
        }
    },
    );

    let output = "";

    ytDlpProcess.stdout.on("data", (data) => {
        output += data.toString();
    })

    return new Promise((resolve, reject) => {
        ytDlpProcess.on("close", (code) => {
            if (code === 0) {
                const filePath = output.trim();
                resolve(filePath);
            } else {
                reject(new Error("Não foi possível baixar o áudio."));
            }
        });
    });
}

app.post<{ Body: VideoBodyRequest }>("/api/video/download", async (request, reply) => {
    
    const filePath = await downloadAudio(request.body.url);
    const fileName = path.basename(filePath)

    const fileStream = fs.createReadStream(filePath);

    // console.log("Arquivo: ", filePath);
    // console.log("Stream criado: ", fileStream);

    return reply
    .type("audio/mpeg")
    .header("Content-Disposition", createContentDisposition(fileName))
    .send(fileStream);
})

function createContentDisposition(fileName: string): string {
    const encodedFileName = encodeURIComponent(fileName);

    return `attachment; filename*=UTF-8''${encodedFileName}`;
}

app.listen({ port: 3000 }, () => {
  console.log("Servidor rodando em http://localhost:3000");
});