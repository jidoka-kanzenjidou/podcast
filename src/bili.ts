import BilingualPodcastService from "./BilingualPodcastService.js";
import VideoCreationService from "./VideoCreationService.js";
import fs from "fs";
import pLimit from "p-limit";
import { extractWords } from "./utils/words.js"

interface Word {
    word: string;
    start: number;
    end: number;
}

interface Segment {
    words: Word[];
}

interface Clip {
    segments: Segment[];
    audioBase64: string;
}

interface PodcastResponse {
    choices: { message: { audio: { trimmed: Clip[] } } }[];
}

// Feature flag for concurrency logic
const USE_CONCURRENCY = false;

let svc = new BilingualPodcastService('https://http-bairingaru-okane-production-80.schnworks.com');

function saveAudioFile(clip: Clip, filePath: string): void {
    fs.writeFileSync(filePath, Buffer.from(clip.audioBase64, 'base64'));
}

async function processClip(clip: Clip, clipIndex: number): Promise<void> {
    const outputFilePath = `./te-${clipIndex}.mp4`
    if (fs.existsSync(outputFilePath)) {
        console.log(`Clip ${clipIndex} already exists, skipping.`);
        return;
    }
    const words: Word[] = extractWords(clip);
    console.log(words)
    const speechFilePath: string = 'speech.aac';
    saveAudioFile(clip, speechFilePath);

    let creation = await VideoCreationService.createVideo({
        speechFilePath,
        musicFilePath: './sample-data/emo.mp3',
        imageFilePaths: [
            './sample_data/puppy_0.jpg',
            './sample_data/puppy_1.jpg',
            './sample_data/puppy_2.jpg',
            './sample_data/puppy_4.jpg',
            './sample_data/puppy_5.jpg'
        ],
        textData: words,
        duration: words[words.length - 1].end,
        fps: 24,
        videoSize: [1920, 1080],
        textConfig: {
            font_color: 'white',
            background_color: 'black'
        },
        outputFilePath
    });
    console.log(creation);
}

async function handlePodcastResponse(response: PodcastResponse | null): Promise<void> {
    const trimmed: Clip[] = response?.choices[0].message.audio.trimmed || [];

    if (trimmed.length === 0) {
        console.log('No clips to process.');
        return;
    }

    const process = async (clip: Clip, index: number) => {
        console.log(`Starting clip ${index + 1}`);
        await processClip(clip, index + 1);
    };

    let tasks: Promise<void>[] = [];

    if (USE_CONCURRENCY) {
        const maxConcurrency = 3;
        const limit = pLimit(maxConcurrency);

        tasks = trimmed.map((clip, index) => limit(() => process(clip, index)));

        try {
            await Promise.all(tasks);
            console.log('All clips processed successfully (concurrent)!');
        } catch (error) {
            console.error('Processing stopped due to an error:', error);
        }
    } else {
        try {
            for (let index = 0; index < trimmed.length; index++) {
                await process(trimmed[index], index);
            }
            console.log('All clips processed successfully (sequential)!');
        } catch (error) {
            console.error('Processing stopped due to an error:', error);
        }
    }
}

(async function () {
    let response = await svc.createAndWaitForPodcast('Hãy tạo một podcast về công nghệ nano.');
    await handlePodcastResponse(response);
})();
