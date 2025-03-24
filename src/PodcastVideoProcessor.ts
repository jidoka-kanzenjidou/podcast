import BilingualPodcastService from "./BilingualPodcastService.js";
import VideoCreationService, { VideoCreationOptions } from "./VideoCreationService.js";
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

export class PodcastVideoProcessor {
    private svc: BilingualPodcastService;
    private imageFilePaths: string[] = [];

    constructor(svc: BilingualPodcastService) {
        this.svc = svc;
    }

    async checkServiceHealth(): Promise<boolean> {
        console.debug('🩺 Checking service health...');
        const isHealthy = await this.svc.checkHealth();

        if (!isHealthy) {
            console.error('🚑 Service health check failed. Aborting podcast video processing.');
            return false;
        }

        console.debug('✅ Service health check passed.');
        return true;
    }

    async prepareImages(query: string): Promise<void> {
        console.debug(`📥 Preparing to download images for query "${query}"...`);

        const imageDownloader = new ImageDownloader(query, 12);
        const imagesBuffer = await imageDownloader.downloadAllImages();

        console.debug(`✅ Downloaded ${imagesBuffer.length} images for query "${query}"`);

        this.imageFilePaths = imagesBuffer.map((buffer, index) => {
            const tmpDir = os.tmpdir();
            const filePath = path.join(tmpDir, `temp_image_${index}.jpg`);
            fs.writeFileSync(filePath, buffer);

            console.debug(`💾 Image ${index} saved to ${filePath}`);
            return filePath;
        });

        console.debug('🖼️ Image preparation completed. File paths:', this.imageFilePaths);
    }

    async generatePodcast(prompt: string): Promise<PodcastResponse | null> {
        console.debug('🎤 Generating podcast for prompt:', prompt);

        const response = await this.svc.createAndWaitForPodcast(prompt);

        if (response) {
            console.debug('✅ Podcast generated successfully.');
        } else {
            console.error('❌ Failed to generate podcast.');
        }

        return response;
    }

    async handlePodcastResponse(response: PodcastResponse | null): Promise<void> {
        console.debug('📦 Handling podcast response...');

        const clips = this.extractClips(response);
        console.debug(`🎞️ Extracted ${clips.length} clips from podcast response.`);

        if (clips.length === 0) {
            console.warn('⚠️ No clips to process.');
            return;
        }

        console.debug('⚙️ Processing clips to generate video creation options...');
        const videoOptions = await this.getVideoCreationOptions(clips);

        if (videoOptions.length === 0) {
            console.warn('⚠️ No video options generated after filtering. Exiting.');
            return;
        }

        console.debug(`🚀 Starting video processing for ${videoOptions.length} clips...`);
        await this.processVideos(videoOptions);
    }

    private extractClips(response: PodcastResponse | null): Clip[] {
        console.debug('🔎 Extracting clips from podcast response...');
        const audioBuffer = Buffer.from(response?.choices[0].message.audio.data || '', 'base64');

        const clips = (response?.choices[0].message.audio.trimmed || []).map((clip: Clip, idx) => {
            console.debug(`🔧 Clip ${idx} extracted:`, clip);
            return {
                ...clip,
                audioBuffer,
            };
        });

        return clips;
    }

    private saveAudioFile(clip: Clip, filePath: string): void {
        console.debug(`💽 Saving audio file for clip at ${filePath}`);
        fs.writeFileSync(filePath, clip.audioBuffer || '');
        console.debug('✅ Audio file saved.');
    }

    private async processClip(clip: Clip, clipIndex: number): Promise<VideoCreationOptions | null> {
        console.debug(`🔨 Processing clip ${clipIndex}...`);

        const outputFilePath = `./te-${clipIndex}.mp4`;
        if (fs.existsSync(outputFilePath)) {
            console.warn(`⚠️ Clip ${clipIndex} already exists at ${outputFilePath}, skipping.`);
            return null;
        }

        const words: Word[] = extractWords(clip);
        console.debug(`📝 Extracted words for clip ${clipIndex}:`, words);

        const speechFilePath: string = `speech-${clipIndex}.aac`;
        this.saveAudioFile(clip, speechFilePath);

        console.debug(`🎬 Video creation options prepared for clip ${clipIndex}.`);
        return {
            startTime: clip.startTime,
            endTime: clip.endTime,
            speechFilePath,
            musicFilePath: './sample-data/emo.mp3',
            imageFilePaths: this.imageFilePaths,
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

    private async getVideoCreationOptions(clips: Clip[]): Promise<VideoCreationOptions[]> {
        console.debug('📋 Collecting video creation options from clips...');

        const validOptions: VideoCreationOptions[] = [];

        for (let index = 0; index < clips.length; index++) {
            const clip = clips[index];
            const option = await this.processClip(clip, index + 1);

            if (option !== null) {
                validOptions.push(option);
                console.debug(`✅ Video option added for clip ${index + 1}.`);
            } else {
                console.debug(`⏭️ Skipped clip ${index + 1}.`);
            }
        }

        console.debug(`🎯 Final video options count: ${validOptions.length}`);
        return validOptions;
    }

    private async processVideos(options: VideoCreationOptions[]): Promise<void> {
        try {
            console.debug('🚚 Requesting video creations...');
            const correlationIds = await this.requestVideoCreations(options);

            console.debug('⏳ Polling for video completions...');
            await this.pollForVideoCompletions(correlationIds, options.map(opt => opt.outputFilePath));

            console.log('🎉 All clips processed and downloaded successfully!');
        } catch (error) {
            console.error('❌ Processing stopped due to an error:', error);
        }
    }

    private async requestVideoCreations(options: VideoCreationOptions[]): Promise<string[]> {
        console.debug('📨 Sending bulk request for video creation...');
        const ids = await VideoCreationService.bulkRequestVideoCreation(options);
        console.debug('✅ Received correlation IDs:', ids);
        return ids;
    }

    private async pollForVideoCompletions(correlationIds: string[], outputFilePaths: string[]): Promise<void> {
        console.debug('📡 Starting polling for video completions...');
        await VideoCreationService.bulkPollForVideos(correlationIds, outputFilePaths, {
            maxAttempts: 60 * 20,
            delay: 1_000,
            onSuccess: (index, filePath) => {
                console.log(`✅ [Clip ${index + 1}] Video downloaded successfully at ${filePath}`);
            },
            onError: (index, error) => {
                console.error(`❌ [Clip ${index + 1}] Failed after max attempts. Error: ${error.message}`);
            }
        });
        console.debug('🏁 Polling for video completions finished.');
    }
}
