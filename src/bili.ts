import BilingualPodcastService from "./BilingualPodcastService.js";
import VideoCreationService from "./VideoCreationService.js";
import fs from "fs";

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

let svc = new BilingualPodcastService('https://http-bairingaru-okane-production-80.schnworks.com');

function extractWords(clip: Clip): Word[] {
    let words: Word[] = clip.segments.reduce((a, b: any) => a.concat(b.words), []).map((word: Word) => ({
        word: word.word,
        start: word.start,
        end: word.end,
    }));
    
    words = words.map((word) => ({
        word: word.word,
        start: parseFloat((word.start - words[0].start).toFixed(3)),
        end: parseFloat((word.end - words[0].start).toFixed(3)),
    }));
    
    for (const word of words) {
        if (word.start === word.end) {
            word.end += 0.001;
        }
        if (word.start >= word.end) {
            console.log(word);
            throw new Error("Invalid word timing");
        }
    }
    return words;
}

function saveAudioFile(clip: Clip, filePath: string): void {
    fs.writeFileSync(filePath, Buffer.from(clip.audioBase64, 'base64'));
}

async function processClip(clip: Clip, clipIndex: number): Promise<void> {
    const words: Word[] = extractWords(clip);
    const speechFilePath: string = 'speech.aac';
    saveAudioFile(clip, speechFilePath);
    
    const creationOpts = {
        speechFilePath,
        musicFilePath: './sample-data/emo.mp3',
        imageFilePath: './sample-data/ladybird-thispost.png',
        textData: words,
        duration: words[words.length - 1].end,
        outputFilePath: `./te-${clipIndex}.mp4`
    };
    
    console.log(creationOpts);
    let creation = await VideoCreationService.createVideo(creationOpts);
    console.log(creation);
}

async function handlePodcastResponse(response: PodcastResponse | null): Promise<void> {
    const trimmed: Clip[] = response?.choices[0].message.audio.trimmed || [];
    let clipIndex = 0;
    
    for (const clip of trimmed) {
        clipIndex++;
        if (clipIndex === 1) continue;
        if (clipIndex > 2) break;
        
        await processClip(clip, clipIndex);
    }
}

svc.createAndWaitForPodcast('Hãy tạo một podcast về công nghệ nano.')
    .then(handlePodcastResponse)
    .catch(error => console.error("Error processing podcast:", error));
