/**
 * Sends a channel over an existing channel.
 * Note that, while it's a standard action, this may not be recognized
 * by the recipient. Always read the recipient's protocol definition
 * before using this function.
 * @param {MessagePort} port
 * @returns {MessagePort} subport
 */
function getSubChannel(port)
{
    const channel = new MessageChannel();
    port.postMessage(channel.port1, [channel.port1]);
    return channel.port2;
}

/**
 * Get the next message delivered to the given message target.
 * TODO: handle port closing
 * @param {MessageEventSource} port
 * @returns {Promise<any>} message
 */
function getOneMessage(port)
{
    return new Promise(resolve => {
        port.start?.();
        const msgHandler = msgEv => resolve(msgEv.data);
        port.addEventListener("message", msgHandler, { once: true });
    });
}

/**
 * Send a standard function call. Because the call uses the same channel it's relatively fast,
 * but you have to make sure no other communication happens between the call and the result.
 * Note that this only works on recipients who understand standard function calls.
 * @param {MessagePort} port 
 * @param {string | number} call 
 * @param {any[]} args
 * @param {Transferable[]} transfer
 * @returns {Promise<any>}
 */
async function ipc(port, call, args, transfer = [])
{
    console.log(`Calling IPC`, call, args, transfer);
    port.postMessage({ call, args, transfer }, transfer);
    const reply = await getOneMessage(port);
    console.log('IPC returned', reply);
    if (reply.error) throw reply.error;
    else return reply.result;
}

/**
 * Send a standard function call through a subchannel. This means that you can use it
 * concurrently but it's slower. Note that this only works on recipients who understand
 * standard function calls and clone the interface on subchannels.
 * @param {MessagePort} port 
 * @param {string | number} call 
 * @param {any[]} args
 * @param {Transferable[]} transfer
 * @returns {Promise<any>}
 */
async function asyncIpc(port, call, args, transfer = [])
{
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
 * @param {MessagePort} port 
 * @param {boolean} sync
 * @returns {Record<string | number, (args: any[], transfer?: Transferable[]) => Promise<any>>}
 */
async function getClient(port, sync = false)
{
    const funcs = await ipc(port, "help");
    const client = {};
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
 * @param {MessagePort} port 
 * @param {string | number} name 
 * @param {(...args: any[]) => any | Promise<any>} callback 
 * @returns {() => void} stop listening
 */
function handleIpc(port, name, callback) {
    const handler = async ev => {
        if (ev.data.call != name) return;
        const args = ev.data.args ?? [];
        try {
            console.log('Now calling IPC handler', name)
            const result = await callback(...args);
            console.log('Call to IPC', name, 'returned', result)
            port.postMessage({ result });
        } catch(error) {
            port.postMessage({ error });
        }
    };
    port.addEventListener('message', handler);
    return () => port.removeEventListener('message', handler);
}

/**
 * Create an asynchronous listener for a standard function call with a specified name.
 * @param {MessagePort} port 
 * @param {string | number} name 
 * @param {(...args: any[]) => any | Promise<any>} callback 
 * @returns {() => void}
 */
function handleAsyncIpc(port, name, callback) {
    // handle direct calls
    let cancel = handleIpc(port, name, callback);
    // set up a handler for subchanneling
    const handler = ev => {
        // the message content looks like a MessagePort.
        // make sure we don't crash to be safe.
        if (typeof ev.data.addEventListener == 'function'
            && typeof ev.data.removeEventListener == 'function'
            && typeof ev.data.postMessage == 'function'
            && typeof ev.data.start == 'function') try {
            // call ourselves on it
            const subCancel = handleAsyncIpc(ev.data, name, callback);
            // Update function cancel to do everything it did until now
            // but also cancel the subchannel's callbacks
            const oldCancel = cancel;
            cancel = () => {
                subCancel();
                oldCancel();
            };
            ev.data.start();
        } catch {}
    };
    port.addEventListener('message', handler)
    // On cacncel, both close all the handlers and stop listening for subchannels
    return () => {
        cancel();
        port.removeEventListener('message', handler)
    }
}

/**
 * Create a standard server, which responds to standard function calls and has a standard help call.  
 * If `sync` is **true** it uses {@link handleCalls} for registering the handler.  
 * If `sync` is **false** it uses {@link handleAsyncCalls} for registering the handler.
 * @param {MessagePort} port 
 * @param {Record<string | number,  (...args: any[]) => Promise<any>>} table 
 * @param {boolean} sync 
 * @returns {() => void}
 */
function getServer(port, table, sync = false) {
    // Get all keys in table
    const keys = Object.getOwnPropertyNames(table);
    // Handle "help", just reply with a list of supported calls.
    let cancel = sync ? handleIpc(port, 'help', () => keys)
                      : handleAsyncIpc(port, 'help', () => keys);
    console.log('keys', keys)
    // Register each call
    for (key of keys) {
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