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