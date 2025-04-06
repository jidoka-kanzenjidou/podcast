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

    constructor() {
        this.storage = new Storage();
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

    private async extractImageSearchQuery(prompt: string): Promise<string | undefined> {
        console.debug('🔑 Extracting best keyword for image search from prompt:', prompt);

        const svc = new FindBestKeywordService();
        const keyword = await svc.runFindBestKeyword(prompt, 20_000, 5 * 60_000);

        console.debug('🔑 Best keyword extracted:', keyword);
        return keyword
            .trim()
            .replace(/^"(.*)"$/, '$1');
    }

    async processPodcastToVideo(prompt: string, taskId: string): Promise<PodcastVideoResult | null> {
        console.log(`🎧 [Task ${taskId}] Starting podcast to video processing...`);
        
        const svc = new BilingualPodcastService();
        const contentProcessor = new GenericContentProcessor(svc, logger);
        const videoManager = new GenericVideoManager();

        this.notifyStep(taskId, "🩺 Đang kiểm tra trạng thái dịch vụ xử lý nội dung...");
        if (!await contentProcessor.checkServiceHealth()) return null;

        this.notifyStep(taskId, "🔍 Đang tạo truy vấn tìm kiếm hình ảnh...")
        const query = await this.extractImageSearchQuery(prompt);
        if (!query) return null;

        this.notifyStep(taskId, "📝 Đang tạo nội dung từ đoạn hội thoại...")
        const response = await contentProcessor.generateContent(prompt);
        if (!response) return null;

        const clips = contentProcessor.extractClipsFromResponse(response).map(clip => ({
            ...clip,
            parentTaskId: taskId,
            fps: parseInt(process.env.PODCAST_CLIP_FPS || "2", 10),
            query: query,
        }));
        if (clips.length === 0) return null;

        this.notifyStep(taskId, "🎬 Đang tạo tuỳ chọn video từ các đoạn cắt...")
        const videoOptions = await contentProcessor.compileVideoCreationOptions(clips);
        if (videoOptions.length === 0) return null;

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
    }
}
