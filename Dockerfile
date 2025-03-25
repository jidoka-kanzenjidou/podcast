# Use an official Node.js image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy dependency definitions
COPY yarn.lock package.json ./

# Install dependencies
RUN yarn install

# Copy the rest of the application
COPY . .

# Build TypeScript files
RUN yarn build

# Set environment variables (optional)
ENV NODE_ENV=production

# Run the app
CMD ["node", "dist/Prompt2VideoConsumer.js"]
