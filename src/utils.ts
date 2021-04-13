/**
 * Open the specified url in the specified frame, and post it the message and
 * transfer as soon as it loads
 */
export function show(frame: HTMLIFrameElement, url: string, message: any, transfer: Transferable[]): void {
    frame.setAttribute('src', url);
    frame.addEventListener('load', () => {
        frame.contentWindow?.postMessage(message, '*', transfer);
    });
}

export function favicon(url: string) {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = url;
}

export const historyApi = {
    go: (delta: number): void => window.history.go(delta),
    history: (): number => window.history.length,
    onPopState: (port: MessagePort): void => {
        const handler = (ev: PopStateEvent) => {
            try { port.postMessage(ev.state); } catch {
                console.error('onpopstate channel threw');
            }
        }
        window.addEventListener('popstate', handler);
        const disengage = () => window.removeEventListener('popstate', handler);
        try { port.onmessage = disengage; }
        catch { disengage(); }
    },
    pushState: (data: any, title: string, url: string): void => history.pushState(data, title, url),
    replaceState: (data: any, title: string, url: string): void => history.replaceState(data, title, url)
}