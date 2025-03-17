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

export function extractWords(clip: Clip): Word[] {
    let words: Word[] = clip.segments.reduce((a, b: any) => a.concat(b.words), []).map((word: Word) => ({
        word: word.word,
        start: word.start,
        end: word.end,
    }));

    words = words.map((word) => ({
        word: word.word,
        start: parseFloat((word.start).toFixed(3)),
        end: parseFloat((word.end).toFixed(3)),
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
