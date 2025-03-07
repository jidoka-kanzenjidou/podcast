import BilingualPodcastService from "./BilingualPodcastService.js";
import VideoCreationService from "./VideoCreationService.js";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

let svc = new BilingualPodcastService('https://http-bairingaru-okane-production-80.schnworks.com');

svc.createAndWaitForPodcast('Hãy tạo một podcast về công nghệ AI.')
    .then(async (response) => {
        const trimmed = response?.choices[0].message.audio.trimmed || [];
        let clipIndex = 0
        for (const clip of trimmed) {
            clipIndex++
            let words = clip.segments.reduce((a, b) => a.concat(b.words), []);
            for (const word of words) {
                console.log(word.start, word.end)
                if (word.start === word.end) {
                    word.end = word.end + 0.001
                }
                if (word.start >= word.end) {
                    console.log(word)
                    throw new Error("a")
                }
            } 
            let speechFilePath = path.join(tmpdir(), `${randomUUID()}.mp3`);
            fs.writeFileSync(speechFilePath, Buffer.from(clip.audioBase64, 'base64'))
            // console.log(clip.audioBase64);
            let creation = await VideoCreationService.createVideo({
                speechFilePath,
                musicFilePath: './sample-data/emotional-piano-music-256262.mp3',
                imageFilePath: './sample-data/ladybird-thispost.png',
                textData: words,
                outputFilePath: './t' + clipIndex + '.mp4'
            });
            console.log(creation);
        }
    });
