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
    
    let filteredWords: Word[] = [];
    for (let i = 0; i < words.length; i++) {
        let word = words[i];
        if (word.start === word.end) {
            word.end += 0.001;
        }
        if (word.start >= word.end) {
            console.log(word);
            throw new Error("Invalid word timing");
        }
        if (i > 0 && (word.end - word.start) < 0.11 && words[i - 1].word.endsWith(".")) {
            console.log("Short word detected:", i, word);
            if (i < words.length - 1) {
                let nextWord = words[i + 1];
                word = {
                    word: word.word + " " + nextWord.word,
                    start: word.start,
                    end: nextWord.end,
                };
                i++; // Skip the next word since it's merged
            }
        }
        filteredWords.push(word);
    }

    return filteredWords;
}

function saveAudioFile(clip: Clip, filePath: string): void {
    fs.writeFileSync(filePath, Buffer.from(clip.audioBase64, 'base64'));
}

async function processClip(clip: Clip, clipIndex: number): Promise<void> {
    const words: Word[] = extractWords(clip);
    console.log(words)
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
        await processClip(clip, clipIndex);
    }
}

svc.createAndWaitForPodcast('Hãy tạo một podcast về công nghệ nano.')
    .then(handlePodcastResponse)
    .catch(error => console.error("Error processing podcast:", error));
