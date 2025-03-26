# Use an official Node.js image
FROM node:18

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy dependency definitions
COPY yarn.lock package.json ./

# Install dependencies
RUN yarn

# Copy the rest of the application
COPY src src
COPY sample-data sample-data
COPY tsconfig.json .

# Build TypeScript files
RUN npx tsc

# Set environment variables (optional)
ENV NODE_ENV=production

# Run the app
CMD ["node", "dist/Prompt2VideoConsumer.js"]
