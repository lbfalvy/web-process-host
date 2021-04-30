import { MessageTarget, Client, Property } from "./types";


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

export function tryReportClosing(port: MessageTarget) {
    globalThis.addEventListener('unload', () => {
        try {
            postMessage(port, { channel: 'close' })
            if ('close' in port) port.close?.()
        } catch(ex) {
            // The port must've been passed on to another window
        }
    });
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
    tryReportClosing(channel.port2);
    return channel.port2;
}

/**
 * Get the next message delivered to the given message target.
 */
export function getOneMessage(port: MessageTarget): Promise<any>
{
    return new Promise((resolve, reject) => {
        if ('start' in port) port.start?.();
        port.addEventListener('message', ev => {
            if (ev.data.channel === 'close') reject(new Error('The channel was closed prematurely'));
            else resolve(ev.data);
        }, { once: true });
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
    subport.start();
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
    const trackOps: Promise<any>[] = [];
    // Handle properties
    // A property is defined as any <Name> for which the server provides
    // trackName(MessagePort) and getName() but doesn't provide Name()
    const propNames = funcs
        .filter(f => f.toString().startsWith('track') && f.toString().length > 'track'.length)
        .map(f => f.toString().substr('track'.length))
        .filter(prop => funcs.includes(`get${prop}`) && !funcs.includes(prop))
    for (const prop of propNames) {
        // We don't use 'get' here beyond ensuring that
        const track = client[`track${prop}`]!;
        // Initialise
        let propValue!: any;
        // Get a messagePort and call 'track' with the pair
        const { port1: foreignPort, port2: localPort } = new MessageChannel();
        track([foreignPort], [foreignPort]);
        tryReportClosing(localPort);
        // Update the value if a message with a 'value' field comes
        localPort.onmessage = ({ data }) => {
            if ('value' in data) {
                console.debug('[IPC] Received value of', prop, 'as', data.value)
                propValue = data.value;
            }
            if ('error' in data) throw new Error(`[IPC] Property error [${data.error}]`);
        };
        if (sync) await getOneMessage(localPort);
        else trackOps.push(getOneMessage(localPort));
        Object.defineProperty(client, prop, {
            get: () => propValue,
            configurable: true,
            enumerable: true
        });
        localPort.start();
    }
    if (!sync) await Promise.all(trackOps);
    return client;
}

/**
 * Create a synchronous listener for a standard function call with a specified name. Note that a function
 * registered in this way cannot have multiple instances running over the same port.
 * @returns stop listening
 */
export function handleIpc<T extends any[]>(
    port: MessageTarget,
    name: string | number,
    callback: (...args: T) => any
): () => void {
    const handler = async (ev: MessageEvent) => {
        if (ev.data.call != name) return;
        const args = ev.data.args ?? [];
        try {
            console.debug('[IPC] Calling IPC handler', name, ...args);
            // Set transfer for querying
            transfer = ev.data.transfer as Transferable[];
            // Call handler
            const promise = callback(...args);
            // Reset transfer
            transfer = undefined;
            // Wait for the function to return
            const result = await promise;
            console.debug('[IPC] Call to IPC handler', name, 'returned', result);
            postMessage(port, { result });
        } catch(error) {
            postMessage(port, { error });
        }
    };
    port.addEventListener('message', handler);
    return () => port.removeEventListener('message', handler);
}

var transfer: Transferable[] | undefined = undefined;
export function getTransfer(): Transferable[] {
    if (transfer instanceof Array) return transfer;
    console.error(
        'getTransfer was called outside an IPC handler.\n'
        + 'If you use asynchronous handlers, make sure that you only call getTransfer '
        + 'before any "await" keywords, as the value is reset after a synchronous call '
        + 'to prevent ambiguity.'
    );
    return [];
}

/**
 * Create an asynchronous listener for a standard function call with a specified name.
 * @returns stop listening
 */
export function handleAsyncIpc<T extends any[]>(
    port: MessageTarget,
    name: string | number,
    callback: (...args: T) => any
): () => void {
    // handle direct calls
    let cancel = handleIpc(port, name, callback);
    // set up a handler for subchanneling
    const handler = (ev: MessageEvent) => {
        // the message content looks like a MessagePort.
        // make sure we don't crash to be safe.
        if (isMessageTarget(ev.data)) try {
            tryReportClosing(ev.data);
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
export function makeServer(port: MessageTarget, table: Record<string, any>, sync = false): () => void {
    // Get all keys in table that correspond to functions
    const keys = Object.getOwnPropertyNames(table).filter(k => typeof table[k] === 'function');
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


export function makeProperty<T, K extends string>(
    name: K,
    initial: T
): Property<K, T> {
    let value: T = initial;
    // All the channels to notify when the value changes
    const trackers = new Set<MessagePort>();
    // Message handler for all trackers
    const handleMessage = (ev: MessageEvent) => {
        const port = ev.source as MessagePort;
        console.debug('[IPC] Closing tracker');
        // On { channel: "close" }, close the port and stop sending tracking updates
        if ('channel' in ev.data && ev.data.channel == 'close' ) {
            port.close();
            trackers.delete(port);
        } else throw new Error('Unrecognized message');
    }
    const ret = {
        // Register a new port for realtime tracking and setting
        [`track${name}`]: (port: MessagePort) => {
            tryReportClosing(port);
            port.addEventListener('message', handleMessage);
            port.start();
            trackers.add(port);
            port.postMessage({ value });
        },
        // Get the value
        [`get${name}`]: (): T => value as T,
    };
    Object.defineProperty(ret, name, {
        get: () => value,
        set: (v: T) => {
            console.debug('[IPC] Updating property', name, 'to', v);
            value = v;
            trackers.forEach(p => p.postMessage({ value }));
        },
        configurable: true
    })
    return ret as Property<K, T>;
}