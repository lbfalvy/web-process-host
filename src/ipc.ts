import { MessageTarget, Client, Callback, Server } from "./types";


export function postMessage(target: MessageTarget, message: any, transfer?: Transferable[]): void {
    if ('document' in target) target.postMessage(message, '*', transfer);
    else if (transfer) target.postMessage(message, transfer);
    else target.postMessage(message);
}

export function isMessageTarget(thing: any): thing is MessageTarget {
    return typeof thing == 'object' && thing !== null
            && typeof thing.addEventListener == 'function'
            && typeof thing.removeEventListener == 'function'
            && typeof thing.postMessage == 'function'
}

/**
 * Sends a channel over an existing channel.
 * Note that, while it's a standard action, this may not be recognized
 * by the recipient. Always read the recipient's protocol definition
 * before using this function.
 */
export function getSubChannel(port: MessageTarget): MessagePort
{
    const channel = new MessageChannel();
    postMessage(port, channel.port1, [channel.port1]);
    return channel.port2;
}

/**
 * Get the next message delivered to the given message target.
 */
export function getOneMessage(port: MessageTarget): Promise<any>
{
    return new Promise((resolve, reject) => {
        if ('start' in port) port.start?.();
        port.addEventListener('message', (((ev: MessageEvent) => {
            if (ev.data.channel === 'close') reject(new Error('The channel was closed prematurely'));
            else resolve(ev.data);
        }) as (ev: Event) => any), { once: true });
    });
}

/**
 * Send a standard function call. Because the call uses the same channel it's relatively fast,
 * but you have to make sure no other communication happens between the call and the result.
 * Note that this only works on recipients who understand standard function calls.
 */
export async function ipc(
    port: MessageTarget,
    call: string | number,
    args?: any[],
    transfer: Transferable[] = []
): Promise<any> {
    console.debug(`[IPC] Calling IPC`, call, args, transfer);
    postMessage(port, { call, args, transfer }, transfer);
    const reply = await getOneMessage(port);
    console.debug('[IPC] IPC reply was', reply);
    if (reply.error) throw reply.error;
    else return reply.result;
}

/**
 * Send a standard function call through a subchannel. This means that you can use it
 * concurrently but it's slower. Note that this only works on recipients who understand
 * standard function calls and clone the interface on subchannels.
 * @returns {Promise<any>}
 */
export async function asyncIpc(
    port: MessageTarget,
    call: string | number,
    args?: any[],
    transfer?: Transferable[]
): Promise<any> {
    const subport = getSubChannel(port);
    try {
        const result = await ipc(subport, call, args, transfer);
        return result;
    } finally {
        subport.close();
    }
}

/**
 * Create a standard client. Note that this only works on recipients who
 * understand standard function calls and have a standard help call.  
 * If `sync` is **true**, the interface uses {@link sys} for the calls.  
 * If `sync` is **false**, the the interface uses {@link async_sys} for the calls.
 * @returns an object with all methods
 */
export function getClient<Result>(port: MessagePort, sync?: boolean): Promise<Result>
export function getClient(port: MessageTarget, sync?: boolean): Promise<Client>
export async function getClient(port: MessageTarget, sync = false): Promise<Client>
{
    const funcs = await ipc(port, "help") as (string | number)[];
    const client = {} as Client;
    for (const func of funcs)
    {
        if (sync) client[func] = (args, transfer) => ipc(port, func, args, transfer);
        else client[func] = (args, transfer) => asyncIpc(port, func, args, transfer);
    }
    return client;
}

/**
 * Create a synchronous listener for a standard function call with a specified name. Note that a function
 * registered in this way cannot have multiple instances running over the same port.
 * @returns stop listening
 */
export function handleIpc(port: MessageTarget, name: string | number, callback: Callback): () => void {
    const handler = async (ev: MessageEvent) => {
        if (ev.data.call != name) return;
        const args = ev.data.args ?? [];
        try {
            console.debug('[IPC] Calling IPC handler', name, ...args);
            const result = await callback(...args);
            console.debug('[IPC] Call to IPC handler', name, 'returned', result);
            postMessage(port, { result });
        } catch(error) {
            postMessage(port, { error });
        }
    };
    port.addEventListener('message', handler as (ev: Event) => any);
    return () => port.removeEventListener('message', handler as (ev: Event) => any);
}

/**
 * Create an asynchronous listener for a standard function call with a specified name.
 * @returns stop listening
 */
export function handleAsyncIpc(port: MessageTarget, name: string | number, callback: Callback): () => void {
    // handle direct calls
    let cancel = handleIpc(port, name, callback);
    // set up a handler for subchanneling
    const handler = (ev: MessageEvent) => {
        // the message content looks like a MessagePort.
        // make sure we don't crash to be safe.
        if (isMessageTarget(ev.data)) try {
            // call ourselves on it
            const subCancel = handleAsyncIpc(ev.data, name, callback);
            // Update function cancel to do everything it did until now
            // but also cancel the subchannel's callbacks
            const oldCancel = cancel;
            cancel = () => {
                subCancel();
                oldCancel();
            };
            if ('start' in ev.data) ev.data.start?.();
        } catch {}
    };
    port.addEventListener('message', handler as (ev: Event) => any)
    // On cacncel, both close all the handlers and stop listening for subchannels
    return () => {
        cancel();
        port.removeEventListener('message', handler as (ev: Event) => any)
    }
}

/**
 * Create a standard server, which responds to standard function calls and has a standard help call.  
 * If `sync` is **true** it uses {@link handleCalls} for registering the handler.  
 * If `sync` is **false** it uses {@link handleAsyncCalls} for registering the handler.
 * @returns {() => void}
 */
export function makeServer(port: MessageTarget, table: Server, sync = false): () => void {
    // Get all keys in table
    const keys = Object.getOwnPropertyNames(table);
    // Handle "help", just reply with a list of supported calls.
    let cancel = sync ? handleIpc(port, 'help', () => keys)
                      : handleAsyncIpc(port, 'help', () => keys);
    console.debug('[IPC] Server created with calls', keys);
    // Register each call
    for (const key of keys) {
        const handler = table[key];
        // Make sure it's a function
        if (typeof handler !== 'function') continue;
        // Handle calls according to the "sync" parameter
        const newCancel = sync ? handleIpc(port, key, handler)
                               : handleAsyncIpc(port, key, handler);
        // Add it to the cancel chain
        const oldCancel = cancel;
        cancel = () => {
            newCancel();
            oldCancel();
        }
    }
    return cancel;
}