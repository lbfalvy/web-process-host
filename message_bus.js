(async function(){


/** 
 * This error represents methods, classes, properties and code paths that
 * arent't yet implemented. These may or may not be unreachable, under development,
 * abstract or overwritten at runtime.
 */
class NotImplementedError extends Error {
    constructor(message = "This method is expected to be defined at a later time.") {
        super(message);
        this.name = "NotImplementedError";
    }
}

/** This will be defined differently for workers and documents */
function sendToRoot(message, transfer) 
{
    throw new NotImplementedError();
}

/** @returns {Window} */
function findRoot(win = this) 
{
    if (win.opener) return findRoot(win.opener); // If it's a popup
    else if (win.top != win) return findRoot(win.top); // If it's an iframe
    else return win; // If it's neither, it can only be root
}

if (!this.document) // If it's a worker
{ 
    // Ask the opener to forward
    sendToRoot = (message, transfer) => postMessage({
        type: "forwardToRoot",
        message, transfer
    }, transfer);
} 
else // If it's a window 
{ 
    // Locate the root and send directly
    const root = findRoot();
    sendToRoot = (message, transfer) => root.postMessage(message, "*", transfer);
}

/**
 * Message handler to carry out forward requests for workers
 * @param {MessageEvent} ev
 */
function workerRootProxy(ev) 
{
    if (ev.data.type == "forwardToRoot") 
    {
        sendToRoot(ev.data.message, ev.data.transfer);
    }
}

/** Worker with automatic forward */
class ProxiedWorker extends Worker 
{
    constructor(...args) 
    {
        super(...args);
        this.addEventListener("message", workerRootProxy);
    }
}

/**
 * Shared worker with automatic forward, defined only
 * if shared workers are supported.
 */
class ProxiedSharedWorker
{
    constructor(...args) 
    { 
        throw new NotImplementedError(
            "SharedWorker isn't available in this context"
        );
    }
}

if (this.SharedWorker) 
{
    // Overriding the class
    ProxiedSharedWorker = class ProxiedSharedWorker extends SharedWorker 
    {
        constructor(...args) 
        {
            super(...args);
            this.port.addEventListener("message", workerRootProxy);
        }
    }
}

// Exports
return {
    sendToRoot, ProxiedWorker, ProxiedSharedWorker 
}



})()