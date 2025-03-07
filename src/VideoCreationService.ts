import axios, { AxiosResponse } from "axios";
import FormData from "form-data";
import fs from "fs";

interface TextData {
  word: string;
  start: number;
  end: number;
}

interface VideoCreationOptions {
  speechFilePath: string;
  musicFilePath: string;
  imageFilePath: string;
  textData: TextData[];
  videoSize?: [number, number];
  textConfig?: { font_color: string; background_color: string };
  fps?: number;
  duration?: number;
  outputFilePath: string;
}

class VideoCreationService {
  private static API_URL =
    "https://http-chokkanteki-okane-production-80.schnworks.com/api/v1/video-creation/";

  /**
   * Uploads media files and text data to create a video.
   * @param options Video creation parameters
   */
  public static async createVideo(
    options: VideoCreationOptions
  ): Promise<string> {
    try {
      const formData = new FormData();

      // Attach media files
      formData.append("speech_file", fs.createReadStream(options.speechFilePath));
      formData.append("music_file", fs.createReadStream(options.musicFilePath));
      formData.append("image_file", fs.createReadStream(options.imageFilePath));

      // Attach JSON data
      formData.append("text_data", JSON.stringify(options.textData));
      formData.append("video_size", JSON.stringify(options.videoSize || [2560, 1440]));
      formData.append(
        "text_config",
        JSON.stringify(options.textConfig || { font_color: "white", background_color: "black" })
      );
      formData.append("fps", options.fps || 24);
      formData.append("duration", options.duration || 10);

      // Make the request
      const response: AxiosResponse = await axios.post(VideoCreationService.API_URL, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        responseType: "arraybuffer", // To handle video binary data
      });

      // Save output video file
      fs.writeFileSync(options.outputFilePath, response.data);
      console.log(`Video saved at: ${options.outputFilePath}`);

      return options.outputFilePath;
    } catch (error) {
      console.error("Error creating video:", error);
      throw new Error("Failed to create video.");
    }
  }
}

export default VideoCreationService;
