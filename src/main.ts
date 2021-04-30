import { getTransfer, makeProperty } from "./ipc";
import { processHost } from "./process_host";
import { extend, favicon, getFavicon, historyApi, show } from "./utils";

const frame = document.getElementById('view') as HTMLIFrameElement | null;
if (!frame) throw new Error('Frame not found');

const host = processHost(
    url => new Worker(url),
    id => {
        const api = extend(
            {
                // Display
                show: (url: string, message: any) => {
                    show(frame, url, message, getTransfer());
                },
                setTitle: (title: string) => {
                    document.title = title;
                    api.Title = title;
                },
                setFavicon: (url: string) => {
                    favicon(url);
                    api.Favicon = url;
                }
            },
            historyApi,
            makeProperty('Title', document.title),
            makeProperty('Favicon', getFavicon())
        );
        console.log('API is', api);
        return api;
    }
);
host.start('./worker.js');
console.log('Host is', host);