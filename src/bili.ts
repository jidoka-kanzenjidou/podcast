import { PodcastVideoProcessor } from "./PodcastVideoProcessor.js";

(async function () {
    const processor = new PodcastVideoProcessor();
    processor.on('step', ({taskId, currentStep}) => {
        console.log({
            parentTaskId: taskId,
            currentStep,
        })
    });
    const finalOutputPath = await processor.processPodcastToVideo(`Trong playlist 'PyTorch vs. TensorFlow: Ưu điểm và nhược điểm', giúp tôi viết kịch bản podcast bằng tiếng Việt cho PyTorch, Ease of Use and Learning Curve. Tránh sử dụng tiếng Anh`, 'task-id')
    console.log(finalOutputPath)
})();
