import { makeProperty } from "./ipc";
import { processHost } from "./process_host";
import { favicon, getFavicon, historyApi, show } from "./utils";

const frame = document.getElementById('view') as HTMLIFrameElement | null;
if (!frame) throw new Error('Frame not found');

const host = processHost(
    url => new Worker(url),
    id => Object.assign({
        // Display
        show: (url: string, message: any, transfer: Transferable[]) => {
            show(frame, url, message, transfer);
        },
        favicon: (url: string) => favicon(url)
    }, historyApi, makeProperty('Title', document.title, value => {
        document.title = value;
        return true;
    }), makeProperty('Favicon', getFavicon(), value => {
        try {
            new URL(value);
            favicon(value);
            return true;
        } catch { return false; }
    }))
);
host.start('./worker.js');
console.log('Host is', host);