import BilingualPodcastService from "genericcontentprocessor.ts/dist/BilingualPodcastService.js"
import { FindBestKeywordService } from "findbestkeywordservice.ts/dist/FindBestKeywordService.js"
import { GenericContentProcessor } from "genericcontentprocessor.ts/dist/GenericContentProcessor.js"
import { GenericVideoManager } from "genericcontentprocessor.ts/dist/GenericVideoManager.js"
import path from "path";
import fs from "fs";
import { Storage } from "./utils/storage.js";
import { createLogger, transports, format } from 'winston';
import { EventEmitter } from 'events';

const logger = createLogger({
    level: 'debug',
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [new transports.Console()],
});

export interface PodcastContentItem {
    translated: string;
    original: string;
}

export interface PodcastVideoResult {
    downloads: string[];
    content: PodcastContentItem[];
}

export class PodcastVideoProcessor {
    private storage: Storage;
    private eventEmitter: EventEmitter;
    private stepTimestamps: Record<string, number> = {};
    private contentProcessor: GenericContentProcessor;

    constructor() {
        this.storage = new Storage();
        const svc = new BilingualPodcastService();
        this.contentProcessor = new GenericContentProcessor(svc, 'Vietnamese', 'English', logger);
        this.eventEmitter = new EventEmitter();
    }

    on(event: string, callback: (...args: any[]) => void): void {
        this.eventEmitter.on(event, callback);
    }

    emit(event: string, ...args: any[]): void {
        this.eventEmitter.emit(event, ...args);
    }

    private notifyStep(taskId: string, currentStep: string): void {
        const now = Date.now();
        const lastTimestamp = this.stepTimestamps[taskId] || now;
        const elapsed = now - lastTimestamp;
        this.stepTimestamps[taskId] = now;

        const elapsedStr = lastTimestamp === now ? '' : ` (+${(elapsed / 1000).toFixed(2)}s)`;
        console.log(`🔔 [Task ${taskId}] ${currentStep}${elapsedStr}`);
        this.emit('step', { taskId, currentStep, elapsedMs: elapsed });
    }

    private notifyFailure(taskId: string, errorMessage: string, errorDetails: string, debugData: any = null): void {
        errorMessage = `❌ ${errorMessage}`
        const now = Date.now();
        const lastTimestamp = this.stepTimestamps[taskId] || now;
        const elapsed = now - lastTimestamp;
        this.stepTimestamps[taskId] = now;

        const elapsedStr = lastTimestamp === now ? '' : ` (+${(elapsed / 1000).toFixed(2)}s)`;
        console.error(`[Task ${taskId}] ${errorMessage}${elapsedStr}`);
        this.emit('debugData', { taskId, errorMessage, errorDetails, elapsed, debugData })
        this.emit('failure', { taskId, errorMessage, errorDetails, elapsedMs: elapsed });
    }

    private async extractImageSearchQuery(prompt: string): Promise<string | undefined> {
        console.debug('🔑 Extracting best keyword for image search from prompt:', prompt);

        const svc = new FindBestKeywordService();
        const keyword = await svc.runFindBestKeyword(prompt, 20_000, 5 * 60_000);

        console.debug('🔑 Best keyword extracted:', keyword);
        return keyword
            .trim()
            .replace(/^"(.*)"$/, '$1');
    }
    private async generateClips(prompt: string, taskId: string, query: string, attempts: number = 5): Promise<{
        clips: any[],
        response: any,
    }> {
        for (let attempt = 1; attempt <= attempts; attempt++) {
            this.notifyStep(taskId, `📝 Attempt ${attempt}: Đang tạo nội dung từ đoạn hội thoại...`);

            const response = await this.contentProcessor.generateContent(prompt, taskId);
            if (!response) {
                if (attempt === attempts) {
                    const msg = "Không thể tạo nội dung từ đoạn hội thoại sau nhiều lần thử.";
                    this.notifyFailure(taskId, msg, "Content generation failed after retries");
                    return {clips: [], response};
                }
                continue;
            }

            const clips = this.contentProcessor.extractClipsFromResponse(response).map(clip => ({
                ...clip,
                parentTaskId: taskId,
                fps: parseInt(process.env.PODCAST_CLIP_FPS || "2", 10),
                query: query,
            }));

            if (clips.length > 0) {
                return {clips, response};
            }

            if (attempt === attempts) {
                const msg = "Không tìm thấy đoạn cắt nào từ nội dung sau nhiều lần thử.";
                this.notifyFailure(taskId, msg, "No clips found in response after retries", [response]);
                return {clips: [], response};
            }
        }

        return {clips: [], response: null};
    }

    async processPodcastToVideo(prompt: string, taskId: string): Promise<PodcastVideoResult | null> {
        try {
            console.log(`🎧 [Task ${taskId}] Starting podcast to video processing...`);

            const videoManager = new GenericVideoManager();

            this.notifyStep(taskId, "🩺 Đang kiểm tra trạng thái dịch vụ xử lý nội dung...");
            if (!await this.contentProcessor.checkServiceHealth()) {
                const msg1 = "Dịch vụ xử lý nội dung không khả dụng.";
                this.notifyFailure(taskId, msg1, "Service health check failed");
                return null;
            }

            this.notifyStep(taskId, "🔍 Đang tạo truy vấn tìm kiếm hình ảnh...")
            const query = await this.extractImageSearchQuery(prompt);
            if (!query) {
                const msg2 = "Không thể tạo truy vấn tìm kiếm hình ảnh.";
                this.notifyFailure(taskId, msg2, "Keyword extraction returned undefined");
                return null;
            }

            const {clips, response} = await this.generateClips(prompt, taskId, query);
            if (clips.length === 0) {
                return null;
            }

            this.notifyStep(taskId, "🎬 Đang tạo tuỳ chọn video từ các đoạn cắt...")
            const videoOptions = await this.contentProcessor.compileVideoCreationOptions(clips, taskId);
            if (videoOptions.length === 0) {
                const msg5 = "Không thể tạo tuỳ chọn video từ các đoạn cắt.";
                this.notifyFailure(taskId, msg5, "Video creation options could not be compiled");
                return null;
            }

            // Convert output paths to absolute paths
            const absVideoOptions = videoOptions.map(option => ({
                ...option,
                outputFilePath: path.resolve(option.outputFilePath)
            }));

            const outputDir = path.resolve('./output');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const completionContent = response.choices[0].message.content
            const finalOutputPath = path.resolve(outputDir, `final_podcast_video_${taskId}.mp4`);

            this.notifyStep(taskId, "⚙️ Đang xử lý và tạo video cuối cùng...")
            await videoManager.processVideos(absVideoOptions, finalOutputPath, true);

            console.log(`🚀 Podcast video processing complete. Output: ${finalOutputPath}`);

            this.notifyStep(taskId, "📤 Đang tải video lên bộ nhớ...")
            const uploadedFileKey = await this.storage.uploadFile(`podcast_${taskId}.mp4`, finalOutputPath);
            console.log(`☁️ Video uploaded to storage with key: ${uploadedFileKey}`);
            console.log(`✅ [Task ${taskId}] Processing complete and uploaded.`);

            return {
                downloads: [uploadedFileKey],
                content: completionContent
            };
        } catch (error) {
            const errorClass = error instanceof Error ? error.constructor.name : typeof error;
            this.notifyFailure(taskId, "Đã xảy ra lỗi khi xử lý video podcast.", `Error class: ${errorClass}\n` + "Unexpected error occurred: " + ((error as Error).stack) + "\n\n" + ((error as Error).message));
            console.error("Error during podcast to video processing:", error);
            if (error instanceof Error) {
                console.error("📄 Error message:", error.message);
                console.error("🧵 Stack trace:", error.stack);
            } else {
                console.error("📄 Raw error object:", JSON.stringify(error, null, 2));
            }
            return null;
        }
    }
}
