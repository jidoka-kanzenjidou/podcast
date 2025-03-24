// Feature flag array
const FEATURE_FLAGS = {
  DEBUG_LOGGING: process.platform === 'darwin', // Toggle debug logging here!
};

// Debug log helper
const debugLog = (...args: any[]) => {
  if (FEATURE_FLAGS.DEBUG_LOGGING) {
    console.log(...args);
  }
};

import axios, { AxiosResponse } from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

interface TextData {
  word: string;
  start: number;
  end: number;
}

export interface VideoCreationOptions {
  startTime: number;
  endTime: number;
  speechFilePath: string;
  musicFilePath: string;
  imageFilePaths: string[];
  textData: TextData[];
  videoSize?: [number, number];
  textConfig?: { font_color: string; background_color: string };
  fps?: number;
  duration: number;
  outputFilePath: string;
}

class VideoCreationService {
  private static API_URL =
    "https://http-chokkanteki-okane-production-80.schnworks.com/api/v1/video-creation/";

  public static async createVideo(
    options: VideoCreationOptions
  ): Promise<string> {
    try {
      debugLog("📤 Starting video creation process with options:");
      debugLog(options);

      const absPaths = this.validateAndResolveFiles(options);
      const formData = this.prepareFormData(options, absPaths);
      const correlationId = await this.requestVideoCreation(formData);
      const videoBuffer = await this.pollForVideo(correlationId);
      await this.downloadVideo(videoBuffer, options.outputFilePath);

      debugLog(`🎉 Video saved at: ${options.outputFilePath}`);
      return options.outputFilePath;
    } catch (error: any) {
      debugLog("❌ Error creating video:");
      debugLog(error);
      throw new Error("Failed to create video.");
    }
  }

  public static async bulkRequestVideoCreation(
    optionsArray: VideoCreationOptions[]
  ): Promise<string[]> {
    try {
      debugLog("📦 Starting sequential bulk video creation requests...");

      const correlationIds: string[] = [];

      for (let index = 0; index < optionsArray.length; index++) {
        const options = optionsArray[index];
        debugLog(`📝 Processing request ${index + 1} of ${optionsArray.length}`);
        const absPaths = this.validateAndResolveFiles(options);
        const formData = this.prepareFormData(options, absPaths);
        const correlationId = await this.requestVideoCreation(formData);

        correlationIds.push(correlationId);
      }

      debugLog("✅ Bulk video creation requests submitted successfully.");
      debugLog("Correlation IDs:");
      debugLog(correlationIds);

      return correlationIds;
    } catch (error: any) {
      console.error("❌ Error in bulk video creation requests:");
      console.error(error);
      throw new Error("Bulk video creation requests failed.");
    }
  }

  public static async bulkPollForVideos(
    correlationIds: string[],
    outputFilePaths: string[],
    options?: {
      maxAttempts?: number;
      delay?: number;
      onProgress?: (index: number, attempt: number, progress?: number) => void;
      onSuccess?: (index: number, filePath: string) => void;
      onError?: (index: number, error: Error) => void;
    }
  ): Promise<void> {
    if (correlationIds.length !== outputFilePaths.length) {
      throw new Error("The number of correlation IDs must match the number of output file paths.");
    }

    const {
      maxAttempts = 12 * 15,
      delay = 5000,
      onProgress,
      onSuccess,
      onError
    } = options || {};

    debugLog("⏳ Starting sequential bulk polling for videos...");

    const completed: boolean[] = correlationIds.map(() => false);
    let attempts = 0;

    while (attempts < maxAttempts) {
      debugLog(`🔎 Bulk polling attempt ${attempts + 1} of ${maxAttempts}...`);

      let allCompleted = true;
      let progressMessages: string[] = [];

      for (let index = 0; index < correlationIds.length; index++) {
        if (completed[index]) {
          continue;
        }

        const correlationId = correlationIds[index];
        const outputFilePath = outputFilePaths[index];

        try {
          const pollUrl = `${VideoCreationService.API_URL}${correlationId}`;
          const response = await this.fetchVideoStatus(pollUrl);
          const contentType = this.getContentType(response);

          if (this.isVideoReady(response, contentType)) {
            const videoBuffer = await this.downloadVideoBuffer(response);
            await this.downloadVideo(videoBuffer, outputFilePath);
            console.log(`✅ [Video ${index + 1}] Download complete: ${outputFilePath}`);
            onSuccess?.(index, outputFilePath);
            completed[index] = true;
          } else {
            let progress: number = 0;
            if (contentType?.startsWith('application/json')) {
              const progressData = await response.json();
              progress = progressData.progress || 0;
              const progressBar = VideoCreationService.createProgressBar(progress);

              const message = `📊 [Video ${String(index + 1).padStart(2, '0')}] `
                + `Progress: ${progressBar} `
                + `${String(progress).padStart(4, '0')}%`;

              progressMessages.push(message);
            }
            onProgress?.(index, attempts, progress);
            allCompleted = false;
          }

        } catch (error: any) {
          debugLog(`⚠️ [Video ${index + 1}] Polling error: ${error.message}`);
          onError?.(index, error);
          allCompleted = false;
        }
      }

      if (progressMessages.length > 0) {
        console.log('\n' + progressMessages.join('\n') + '\n');
      }

      if (allCompleted) {
        debugLog("🎉 All videos have been successfully polled and downloaded!");
        return;
      }

      attempts++;
      debugLog(`🔁 Waiting ${delay / 1000} seconds before next bulk polling attempt...`);
      await this.delay(delay);
    }

    for (let index = 0; index < correlationIds.length; index++) {
      if (!completed[index]) {
        debugLog(`❌ [Video ${index + 1}] Polling timed out.`);
        onError?.(index, new Error("Polling timed out"));
      }
    }
  }

  private static createProgressBar(progress: number): string {
    const totalBlocks = 20;
    const filledBlocks = Math.round((progress / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    return `|${"🟩".repeat(filledBlocks)}${"⬜".repeat(emptyBlocks)}|`;
  }

  private static validateAndResolveFiles(options: VideoCreationOptions) {
    const absSpeechFilePath = path.resolve(options.speechFilePath);
    const absMusicFilePath = path.resolve(options.musicFilePath);
    const absImageFilePaths = options.imageFilePaths.map(imagePath => path.resolve(imagePath));

    if (!fs.existsSync(absSpeechFilePath)) {
      throw new Error(`Speech file not found at path: ${absSpeechFilePath}`);
    }

    if (!fs.existsSync(absMusicFilePath)) {
      throw new Error(`Music file not found at path: ${absMusicFilePath}`);
    }

    absImageFilePaths.forEach((imagePath) => {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found at path: ${imagePath}`);
      }
    });

    return { absSpeechFilePath, absMusicFilePath, absImageFilePaths };
  }

  private static prepareFormData(options: VideoCreationOptions, paths: {
    absSpeechFilePath: string,
    absMusicFilePath: string,
    absImageFilePaths: string[]
  }) {
    const formData = new FormData();

    formData.append("speech_file", fs.createReadStream(paths.absSpeechFilePath));
    formData.append("music_file", fs.createReadStream(paths.absMusicFilePath));

    paths.absImageFilePaths.forEach(imagePath => {
      formData.append("image_files", fs.createReadStream(imagePath));
    });

    formData.append("text_data", JSON.stringify(options.textData));
    formData.append("video_size", JSON.stringify(options.videoSize || [2560, 1440]));
    formData.append(
      "text_config",
      JSON.stringify(options.textConfig || { font_color: "white", background_color: "black" })
    );
    formData.append("fps", `${options.fps || 24}`);
    formData.append("duration", `${options.duration}`);
    formData.append("start_time", `${options.startTime}`);
    formData.append("end_time", `${options.endTime}`);

    return formData;
  }

  private static async requestVideoCreation(formData: FormData): Promise<string> {
    debugLog("🚀 Sending request to video creation API");

    const response: AxiosResponse = await axios.post(VideoCreationService.API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    const correlationId = response.data['correlation_id'];
    debugLog(`✅ Video processing started. Correlation ID: ${correlationId}`);

    return correlationId;
  }

  private static async pollForVideo(correlationId: string): Promise<Buffer> {
    const pollUrl = `${VideoCreationService.API_URL}${correlationId}`;
    let attempts = 0;
    const maxAttempts = 12 * 15;
    const delay = 5000;

    debugLog(`⏳ Polling for video status. Correlation ID: ${correlationId}`);

    while (attempts < maxAttempts) {
      debugLog(`🔎 Attempt ${attempts + 1} of ${maxAttempts}...`);

      const response = await this.fetchVideoStatus(pollUrl);
      const contentType = this.getContentType(response);

      if (this.isVideoReady(response, contentType)) {
        return await this.downloadVideoBuffer(response);
      }

      if (contentType?.startsWith('application/json')) {
        const data = await response.json();
        const progress = data.progress;
        const progressBar = VideoCreationService.createProgressBar(progress);
        console.log(`📊 Progress: ${progress}% ${progressBar}`);
      }

      attempts++;
      debugLog(`🔁 Waiting ${delay / 1000} seconds before next attempt...`);
      await this.delay(delay);
    }

    debugLog("❌ Video processing timed out after maximum attempts.");
    throw new Error("Video processing timed out.");
  }

  private static async fetchVideoStatus(pollUrl: string): Promise<Response> {
    try {
      const response = await fetch(pollUrl);
      debugLog(`📡 Received response. Status: ${response.status}`);

      if (!response.ok) {
        debugLog(`⚠️ Non-OK HTTP status: ${response.status}. Retrying...`);
      }

      return response;
    } catch (error) {
      debugLog(`⚠️ Error occurred while polling for video: ${(error as Error).message}`);
      throw error;
    }
  }

  private static getContentType(response: Response): string | null {
    const contentType = response.headers.get("content-type");
    debugLog(`📑 Content-Type received: ${contentType}`);
    return contentType;
  }

  private static isVideoReady(response: Response, contentType: string | null): boolean {
    if (contentType === "video/mp4") {
      debugLog("✅ Video processing completed! Video is ready to download.");
      return true;
    }

    debugLog("⌛ Video is not ready yet. Retrying after delay...");
    return false;
  }

  private static async downloadVideoBuffer(response: Response): Promise<Buffer> {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async downloadVideo(videoBuffer: Buffer, outputFilePath: string): Promise<void> {
    try {
      fs.writeFileSync(outputFilePath, videoBuffer);
    } catch (error) {
      debugLog("❌ Error downloading video:");
      debugLog(error);
      throw new Error("Failed to download video.");
    }
  }
}

export default VideoCreationService;
