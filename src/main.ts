import { processHost } from "./process_host";
import { favicon, historyApi, show } from "./utils";

const frame = document.getElementById('view') as HTMLIFrameElement | null;
if (!frame) throw new Error('Frame not found');

const host = processHost(
    url => new Worker(url),
    id => Object.assign({
        // Display
        show: (url: string, message: any, transfer: Transferable[]) => {
            show(frame, url, message, transfer);
        },
        title: (title: string) => document.title = title,
        favicon: (url: string) => favicon(url)
    }, historyApi)
);
host.start('./worker.js');
console.log('Host is', host);