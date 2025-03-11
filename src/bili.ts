import BilingualPodcastService from "./BilingualPodcastService.js";
import VideoCreationService, { VideoCreationOptions } from "./VideoCreationService.js";
import fs from "fs";
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

async function processClip(clip: Clip, clipIndex: number): Promise<VideoCreationOptions | null> {
    const outputFilePath = `./te-${clipIndex}.mp4`;
    if (fs.existsSync(outputFilePath)) {
        console.log(`Clip ${clipIndex} already exists, skipping.`);
        return null;
    }

    const words: Word[] = extractWords(clip);
    console.log(words);
    const speechFilePath: string = `speech-${clipIndex}.aac`;
    saveAudioFile(clip, speechFilePath);

    return {
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
    };
}

async function handlePodcastResponse(response: PodcastResponse | null): Promise<void> {
    const trimmed: Clip[] = response?.choices[0].message.audio.trimmed || [];

    if (trimmed.length === 0) {
        console.log('No clips to process.');
        return;
    }

    console.log(`Processing ${trimmed.length} clips in bulk mode.`);

    const optionsPromises = trimmed.map((clip, index) => processClip(clip, index + 1));
    const options = (await Promise.all(optionsPromises)).filter(opt => opt !== null) as VideoCreationOptions[];

    if (options.length === 0) {
        console.log('No clips to process after filtering existing files.');
        return;
    }

    try {
        const correlationIds = await VideoCreationService.bulkRequestVideoCreation(options);
        const outputFilePaths = options.map(opt => opt.outputFilePath);

        await VideoCreationService.bulkPollForVideos(correlationIds, outputFilePaths, {
            maxAttempts: 12 * 10, // 10 minutes assuming 5s delay
            delay: 5000, // 5 seconds
            onProgress: (index, attempt) => {
                console.log(`⏳ [Clip ${index + 1}] Polling attempt ${attempt + 1}`);
            },
            onSuccess: (index, filePath) => {
                console.log(`✅ [Clip ${index + 1}] Video downloaded successfully at ${filePath}`);
            },
            onError: (index, error) => {
                console.error(`❌ [Clip ${index + 1}] Failed after max attempts. Error: ${error.message}`);
            }
        });

        console.log('🎉 All clips processed and downloaded successfully!');
    } catch (error) {
        console.error('Processing stopped due to an error:', error);
    }
}

(async function () {
    let response = await svc.createAndWaitForPodcast('Hãy tạo một podcast về công nghệ nano.');
    await handlePodcastResponse(response);
})();
