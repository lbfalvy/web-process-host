import { processHost } from "./process_host";
import { historyApi, show } from "./utils";

const frame = document.getElementById('view') as HTMLIFrameElement | null;
if (!frame) throw new Error('Frame not found');

const host = processHost(
    url => new Worker(url),
    id => Object.assign({
        // Display
        show: (url: string, message: any, transfer: Transferable[]) => {
            show(frame, url, message, transfer);
        },
    }, historyApi)
);
host.start('./worker.js');
console.log('Host is', host);