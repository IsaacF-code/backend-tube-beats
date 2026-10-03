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

const frontUrl = process.env.FRONTEND_URL || "http://localhost:5173";

await app.register(cors, {
    origin: frontUrl,
    exposedHeaders: ["Content-Disposition"]
})

function isYouTubeUrl(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        
        return (
            parsedUrl.hostname === "youtube.com" ||
            parsedUrl.hostname === "www.youtube.com" ||
            parsedUrl.hostname === "youtu.be"
        )
    } catch {
        return false;
    }
}

type VideoInfo = {
    title: string;
    duration: number;
    thumbnail: string;
}

function getVideoInfo(url: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
    
        const ytDlpProcess = spawn("yt-dlp", [
            "--js-runtimes", `node: ${process.execPath}`,
            "--dump-single-json",
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
                try {
                const video = JSON.parse(output);
                resolve({
                    title: video.title,
                    duration: video.duration,
                    thumbnail: video.thumbnail
                });
                } catch {
                    reject(new Error("Não foi possível analisar as informações do vídeo."));
                }
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
        "--js-runtimes", `node: ${process.execPath}`,
        "-x",
        "--audio-format", "mp3", 
        "--embed-metadata", "--embed-thumbnail",
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
    
    const isYoutube = isYouTubeUrl(request.body.url);

    if (!isYoutube) {
        return reply.status(400).send({
            error: "A URL fornecida precisa ser do YouTube."
        });
    }

    try {

        const filePath = await downloadAudio(request.body.url);
        const fileName = path.basename(filePath)

        const fileStream = fs.createReadStream(filePath);

        fileStream.on("close", () => {
            fs.unlink(filePath, (error) => {
                if (error) {
                    console.error("Erro ao excluir arquivo temporário: ", error);
                }
            })
        })

        return reply
        .type("audio/mpeg")
        .header("Content-Disposition", createContentDisposition(fileName))
        .send(fileStream);
    
    } catch (error) {
        console.error(error);
        return reply.status(502).send({
            error: "Não foi possível baixar o áudio. Verifique se a URL é válida e tente novamente."
        });
    }
})

function createContentDisposition(fileName: string): string {
    const encodedFileName = encodeURIComponent(fileName);

    return `attachment; filename*=UTF-8''${encodedFileName}`;
}

const port = Number(process.env.PORT) || 3000;

app.listen({ 
    port,
    host: "0.0.0.0"
}, () => {
  console.log(`Servidor rodando na porta ${port}`);
});