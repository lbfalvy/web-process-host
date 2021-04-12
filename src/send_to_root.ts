import { SendToRoot } from "./types";

/**
 * Module constructor. Elements of this module:
 * - sendToRoot will make sure the message gets to the top of the
 *   opener/parent frame chain.  
 * - ProxiedWorker is a subclass of Worker that forwards messages upwards to
 *   the root window.  
 * - ProxiedSharedWorker is a subclass of SharedWorker that forwards messages
 *   upwards to the root window.
 */
export function sendToRoot(this: WindowOrWorkerGlobalScope): SendToRoot {
    /** 
     * Represents methods, classes, properties and code paths that arent't yet
     * implemented. These could be unreachable, under development, abstract or
     * expected to be overwritten at runtime.
     */
    class NotImplementedError extends Error {
        constructor(
            message =  "This method is expected to be defined at a later time."
        ) {
            super(message);
            this.name = "NotImplementedError";
        }
    }

    /** This will be defined differently for workers and documents */
    let sendToRoot = (message: any, transfer: Transferable[]): void => {
        throw new NotImplementedError();
    }

    function findRoot(win?: Window) : Window
    {
        if (!win) win = window;
        if (win.opener) return (win.opener); // If it's a popup
        else if (win.top != win) return findRoot(win.top); // If it's an iframe
        else return win; // If it's neither, it can only be root
    }

    if ('document' in this) // If it's a window 
    { 
        // Locate the root and send directly
        const root = findRoot();
        sendToRoot = (message, transfer) => {
            root.postMessage(message, "*", transfer);
        };
    }
    else // If it's a worker
    { 
        // Ask the opener to forward
        sendToRoot = (message, transfer) => postMessage({
            type: "forwardToRoot",
            message, transfer
        }, transfer);
    } 
    
    /**
     * Message handler to carry out forward requests for workers
     */
    function workerRootProxy(ev: MessageEvent) 
    {
        if (ev.data.type == "forwardToRoot") 
        {
            sendToRoot(ev.data.message, ev.data.transfer);
        }
    }

    /** Worker with automatic forward */
    class ProxiedWorker extends Worker 
    {
        constructor(stringUrl: string | URL, options?: WorkerOptions) 
        {
            super(stringUrl, options);
            this.addEventListener("message", workerRootProxy);
        }
    }

    /**
     * Shared worker with automatic forward, defined only
     * if shared workers are supported.
     */
    let ProxiedSharedWorker: typeof SharedWorker | undefined = undefined

    if ('SharedWorker' in this) 
    {
        // Overriding the class
        ProxiedSharedWorker = class ProxiedSharedWorker extends SharedWorker
        {
            constructor(scriptUrl: string, options?: string | WorkerOptions) 
            {
                super(scriptUrl, options);
                this.port.addEventListener("message", workerRootProxy);
            }
        }
    }

    // Exports
    return {
        sendToRoot, ProxiedWorker, ProxiedSharedWorker 
    }
}