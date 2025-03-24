import BilingualPodcastService from "./BilingualPodcastService.js";
import { VideoCreationOptions } from "./VideoCreationService.js";
import { ImageDownloader } from "./ImageDownloader.js";
import fs from "fs";
import os from "os";
import path from "path";
import { extractWords } from "./utils/words.js"

interface PodcastContent {
    translated: string;
    original: string;
}
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
    choices: { message: { content: PodcastContent[]; audio: { data: string; buffer?: Buffer; trimmed: Clip[] } } }[];
}

export class PodcastContentProcessor {
    private svc: BilingualPodcastService;
    private imageFilePaths: string[] = [];

    constructor(svc: BilingualPodcastService) {
        this.svc = svc;
    }

    async checkServiceHealth(): Promise<boolean> {
        console.debug('🩺 Checking service health...');
        const isHealthy = await this.svc.checkHealth();
        if (!isHealthy) {
            console.error('🚑 Service health check failed. Aborting...');
        } else {
            console.debug('✅ Service health check passed.');
        }
        return isHealthy;
    }

    async prepareImages(query: string): Promise<string[]> {
        console.debug(`📥 Preparing images for query: "${query}"`);
        const imageDownloader = new ImageDownloader(query, 12);
        const imagesBuffer = await imageDownloader.downloadAllImages();

        this.imageFilePaths = imagesBuffer.map((buffer, index) => {
            const tmpDir = os.tmpdir();
            const filePath = path.join(tmpDir, `temp_image_${index}.jpg`);
            fs.writeFileSync(filePath, buffer);
            console.debug(`💾 Saved image ${index} at ${filePath}`);
            return filePath;
        });

        return this.imageFilePaths;
    }

    async generatePodcast(prompt: string): Promise<PodcastResponse | null> {
        console.debug('🎤 Generating podcast for prompt:', prompt);
        const response = await this.svc.createAndWaitForPodcast(prompt);
        if (response) {
            console.debug('✅ Podcast generated.');
        } else {
            console.error('❌ Podcast generation failed.');
        }
        return response;
    }

    extractClips(response: PodcastResponse | null): Clip[] {
        console.debug('🔎 Extracting clips...');
        const audioBuffer = Buffer.from(response?.choices[0].message.audio.data || '', 'base64');
        return (response?.choices[0].message.audio.trimmed || []).map((clip, idx) => ({
            ...clip,
            audioBuffer
        }));
    }

    private saveAudioFile(clip: Clip, filePath: string): void {
        console.debug(`💽 Saving audio for clip to ${filePath}`);
        fs.writeFileSync(filePath, clip.audioBuffer || '');
    }

    async processClip(clip: Clip, clipIndex: number): Promise<VideoCreationOptions | null> {
        console.debug(`🔨 Processing clip ${clipIndex}...`);
        const outputFilePath = `./te-${clipIndex}.mp4`;

        if (fs.existsSync(outputFilePath)) {
            console.warn(`⚠️ Clip ${clipIndex} already exists. Skipping.`);
            return null;
        }

        const words = extractWords(clip);
        const speechFilePath = `speech-${clipIndex}.aac`;
        this.saveAudioFile(clip, speechFilePath);

        return {
            startTime: clip.startTime,
            endTime: clip.endTime,
            speechFilePath,
            musicFilePath: './sample-data/emo.mp3',
            imageFilePaths: this.imageFilePaths,
            textData: words,
            duration: words[words.length - 1]?.end || clip.endTime,
            fps: 2,
            videoSize: [1920, 1080],
            textConfig: {
                font_color: 'white',
                background_color: 'black'
            },
            outputFilePath
        };
    }

    async getVideoCreationOptions(clips: Clip[]): Promise<VideoCreationOptions[]> {
        console.debug('📋 Generating video creation options...');
        const options: VideoCreationOptions[] = [];

        for (let i = 0; i < clips.length; i++) {
            const option = await this.processClip(clips[i], i + 1);
            if (option) {
                options.push(option);
            }
        }

        return options;
    }
}
