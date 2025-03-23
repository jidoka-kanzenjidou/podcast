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
    choices: { message: {content: PodcastContent[]; audio: { data: string; buffer?: Buffer; trimmed: Clip[] } } }[];
}

export class PodcastVideoOrchestrator {
    private svc: BilingualPodcastService;
    private processor: PodcastVideoProcessor;

    constructor() {
        this.svc = new BilingualPodcastService();
        this.processor = new PodcastVideoProcessor(this.svc);
    }

    async run(prompt: string): Promise<void> {
        if (!(await this.processor.checkServiceHealth())) return;

        const response = await this.processor.generatePodcast(prompt);

        if (response?.choices[0].message.content) {
            const imageSearchQuery = await this.extractImageSearchQuery(response?.choices[0].message.content)
            await this.processor.prepareImages(imageSearchQuery);

            await this.processor.handlePodcastResponse(response);
        }
    }

    async extractImageSearchQuery(content: PodcastContent[]): Promise<string> {
        console.log(content.map((podcastContent: PodcastContent) => {
            return podcastContent.translated
        }).join("\n"))

        return ''
    }
}

class PodcastVideoProcessor {
    private svc: BilingualPodcastService;
    private imageFilePaths: string[] = [];

    constructor(svc: BilingualPodcastService) {
        this.svc = svc;
    }

    async checkServiceHealth(): Promise<boolean> {
        const isHealthy = await this.svc.checkHealth();

        if (!isHealthy) {
            console.error('🚑 Service health check failed. Aborting podcast video processing.');
            return false;
        }

        return true;
    }

    async prepareImages(query: string): Promise<void> {
        const imageDownloader = new ImageDownloader(query, 5);
        const imagesBuffer = await imageDownloader.downloadAllImages();

        console.log(`Downloaded ${imagesBuffer.length} images for query "${query}"`);

        this.imageFilePaths = imagesBuffer.map((buffer, index) => {
            const tmpDir = os.tmpdir();
            const filePath = path.join(tmpDir, `temp_image_${index}.jpg`);
            fs.writeFileSync(filePath, buffer);
            return filePath;
        });
    }

    async generatePodcast(prompt: string): Promise<PodcastResponse | null> {
        return await this.svc.createAndWaitForPodcast(prompt);
    }

    async handlePodcastResponse(response: PodcastResponse | null): Promise<void> {
        const clips = this.extractClips(response);

        if (clips.length === 0) {
            console.log('No clips to process.');
            return;
        }

        console.log(`Processing ${clips.length} clips.`);

        const videoOptions = await this.getVideoCreationOptions(clips);

        if (videoOptions.length === 0) {
            console.log('No clips to process after filtering existing files.');
            return;
        }

        await this.processVideos(videoOptions);
    }

    private extractClips(response: PodcastResponse | null): Clip[] {
        const audioBuffer = Buffer.from(response?.choices[0].message.audio.data || '', 'base64');
        return (response?.choices[0].message.audio.trimmed || []).map((clip: Clip) => {
            return {
                ...clip,
                audioBuffer,
            };
        });
    }

    private saveAudioFile(clip: Clip, filePath: string): void {
        fs.writeFileSync(filePath, clip.audioBuffer || '');
    }

    private async processClip(clip: Clip, clipIndex: number): Promise<VideoCreationOptions | null> {
        const outputFilePath = `./te-${clipIndex}.mp4`;
        if (fs.existsSync(outputFilePath)) {
            console.log(`Clip ${clipIndex} already exists, skipping.`);
            return null;
        }

        const words: Word[] = extractWords(clip);
        console.log(words);
        const speechFilePath: string = `speech-${clipIndex}.aac`;
        this.saveAudioFile(clip, speechFilePath);

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
        const validOptions: VideoCreationOptions[] = [];

        for (let index = 0; index < clips.length; index++) {
            const clip = clips[index];
            const option = await this.processClip(clip, index + 1);
            if (option !== null) {
                validOptions.push(option);
            }
        }

        console.log(`Filtered out ${clips.length - validOptions.length} clips with existing videos.`);
        return validOptions;
    }

    private async processVideos(options: VideoCreationOptions[]): Promise<void> {
        try {
            const correlationIds = await this.requestVideoCreations(options);
            await this.pollForVideoCompletions(correlationIds, options.map(opt => opt.outputFilePath));
            console.log('🎉 All clips processed and downloaded successfully!');
        } catch (error) {
            console.error('Processing stopped due to an error:', error);
        }
    }

    private async requestVideoCreations(options: VideoCreationOptions[]): Promise<string[]> {
        return VideoCreationService.bulkRequestVideoCreation(options);
    }

    private async pollForVideoCompletions(correlationIds: string[], outputFilePaths: string[]): Promise<void> {
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
}
