#!/bin/bash

npx tsc && \
node dist/bili.js && \
ffmpeg -f concat -safe 0 -i file-list.txt -c copy output.mp4
