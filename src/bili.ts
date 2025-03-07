import BilingualPodcastService from "./BilingualPodcastService.js";

let svc = new BilingualPodcastService('https://http-bairingaru-okane-production-80.schnworks.com');

svc.createAndWaitForPodcast('Hãy tạo một podcast về công nghệ AI.')
    .then((...t)=>{
        console.log(t)
    })
