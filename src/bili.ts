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
    startTime: number;
    endTime: number;
    audioBase64: string;
    audioBuffer?: Buffer,
}

interface PodcastResponse {
    choices: { message: { audio: { data: string; buffer?: Buffer; trimmed: Clip[] } } }[];
}

// Feature flag for concurrency logic
const USE_CONCURRENCY = false;

let svc = new BilingualPodcastService('https://http-bairingaru-okane-production-80.schnworks.com');

function saveAudioFile(clip: Clip, filePath: string): void {
    fs.writeFileSync(filePath, clip.audioBuffer || '');
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
        startTime: clip.startTime,
        endTime: clip.endTime,
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
        fps: 24,  // 1,
        videoSize: [1920, 1080],
        textConfig: {
            font_color: 'white',
            background_color: 'black'
        },
        outputFilePath
    };
}

async function handlePodcastResponse(response: PodcastResponse | null): Promise<void> {
    const clips = extractClips(response);

    if (clips.length === 0) {
        console.log('No clips to process.');
        return;
    }

    console.log(`Processing ${clips.length} clips.`);

    const videoOptions = await getVideoCreationOptions(clips.slice(6));

    if (videoOptions.length === 0) {
        console.log('No clips to process after filtering existing files.');
        return;
    }

    await processVideos(videoOptions);
}

function extractClips(response: PodcastResponse | null): Clip[] {
    let audioBuffer = Buffer.from(response?.choices[0].message.audio.data || '', 'base64')
    return (response?.choices[0].message.audio.trimmed || []).map((clip: Clip)=>{
        return {
            ...clip,
            audioBuffer,
        };
    });
}

async function getVideoCreationOptions(clips: Clip[]): Promise<VideoCreationOptions[]> {
    const optionPromises = clips.map((clip, index) => processClip(clip, index + 1));
    const options = await Promise.all(optionPromises);
    const validOptions = options.filter((opt): opt is VideoCreationOptions => opt !== null);

    console.log(`Filtered out ${clips.length - validOptions.length} clips with existing videos.`);
    return validOptions;
}

async function processVideos(options: VideoCreationOptions[]): Promise<void> {
    try {
        const correlationIds = await requestVideoCreations(options);
        await pollForVideoCompletions(correlationIds, options.map(opt => opt.outputFilePath));
        console.log('🎉 All clips processed and downloaded successfully!');
    } catch (error) {
        console.error('Processing stopped due to an error:', error);
    }
}

async function requestVideoCreations(options: VideoCreationOptions[]): Promise<string[]> {
    return VideoCreationService.bulkRequestVideoCreation(options);
}

async function pollForVideoCompletions(correlationIds: string[], outputFilePaths: string[]): Promise<void> {
    await VideoCreationService.bulkPollForVideos(correlationIds, outputFilePaths, {
        maxAttempts: 60 * 20, // 10 minutes assuming 1s delay
        delay: 1_000, // 1 second
        onSuccess: (index, filePath) => {
            console.log(`✅ [Clip ${index + 1}] Video downloaded successfully at ${filePath}`);
        },
        onError: (index, error) => {
            console.error(`❌ [Clip ${index + 1}] Failed after max attempts. Error: ${error.message}`);
        }
    });
}

(async function () {
    let response = await svc.createAndWaitForPodcast('Hãy tạo một podcast về công nghệ nano.');
    await handlePodcastResponse(response);
})();
