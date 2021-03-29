/**
 * Create a process host.
 * @param {(url: string) => MessagePort} getPort
 * @param {(pid: number) => Record<string | number, (...args: any[]) => any>} hostApiCallback
 * @return {{
 *  start: (url: string) => number,
 *  fork: (port: MessagePort, parent: number) => number,
 *  separate: (pid: number) => void,
 *  exit: (pid: number) => void,
 *  send: (target: number, data: any, transfer: Transferable[]) => void,
 *  name: (pid: number, name: string) => boolean,
 *  find: (name: string) => number,
 *  wait: (name: string) => number | Promise<number>,
 *  children: (pid: number) => Set<number>
 *  parent: (pid: number) => number | undefined
 * }}
 */
function processHost(getPort, hostApiCallback) {
    let idCounter = 0;
    /**
     * Returns a new process ID
     * @returns {number}
     */
    const getPID = () => {
        while (table.has(++idCounter));
        return idCounter;
    };

    // ================== Lifetimes ======================

    /**
     * A struct map of everything there is to know about each process.
     * @typedef {{
     *  port: MessagePort | Worker,
     *  parent?: number,
     *  children: Set<number>
     * }} Process
     * @type {Map<number, Process>} */
    const table = new Map();

    /**
     * Construct an instance of the system API that listens on the port of the
     * process.
     * @param {number} pid 
     */
    const buildAPI = pid => {
        const proc = table.get(pid);
        getServer(proc.port, Object.assign(
            {
                // Lifetime
                start,
                fork: port => fork(port, pid),
                separate: () => separate(pid),
                exit: () => exit(pid),
                // Communicate
                getPid: () => pid,
                send: (pid, data, transfer) => send(pid, data, transfer),
                // Manage visibility
                name: n => name(pid, n),
                // Query processes
                find: name => find(name),
                wait: name => wait(name)
            },
            hostApiCallback(pid)
        ));
    };

    /**
     * Starts a new process from URL
     * @param {string} url
     * @returns {number}
     */
    const start = url => {
        const pid = getPID();
        const port = getPort(url);
        table.set(pid, {
            port, children: new Set()
        });
        buildAPI(pid);
        return pid;
    };

    /**
     * Accept the port as a child process of the parent.
     * @param {MessagePort} port 
     * @param {number} parent 
     */
    const fork = (port, parent) => {
        const parentObj = table.get(parent);
        if (!parentObj) throw new Error('Process not found');
        const pid = getPID();
        table.set(pid, {
            port, parent, children: new Set()
        });
        buildAPI(pid);
        parentObj.children.add(pid);
        return pid;
    };

    /**
     * Separate the process from its parent.
     * @param {number} pid 
     */
    const separate = pid => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        const parent = table.get(proc.parent);
        if (!parent) throw new Error('Process has no parent');
        delete proc.parent;
        parent.children.delete(pid);
    };

    /**
     * Remove this process from the table, remove it from its parent's list of
     * children and close its channel. Do the same for all of its children.
     * @param {number} pid 
     */
    const exit = pid => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        for (const child of proc.children) {
            exit(child);
        }
        const parent = table.get(proc.parent);
        if (parent) parent.children.delete(pid);
        table.delete(pid);
        proc.port.close();
    };

    // ================ Messaging =====================

    /**
     * Send a message to the process.
     * @param {number} pid 
     * @param {any} data 
     * @param {Transferable[]} transfer 
     */
    const send = (pid, data, transfer) => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        proc.port.postMessage(data, transfer);
    };

    // =================== Visibility ========================

    /** @type {Map<string, number>} */
    const names = new Map();
    /** @type {Map<string, ((pid: number) => void)[]>} */
    const nameCallbacks = new Map();

    /**
     * Set the name for the given process
     * @param {number} pid 
     * @param {string} name 
     * @returns {boolean}
     */
    const name = (pid, name) => {
        const proc = table.get(pid);
        if (names.has(name)) return false;
        if (!proc) throw new Error('Process not found');
        if (proc.name) names.delete(proc.name);
        if (!name) return true;
        names.set(name, pid);
        const callbacks = nameCallbacks.get(name);
        if (!callbacks) return true;
        for (const cb of callbacks) cb(pid);
    };

    /**
     * Find the process identified by a given name, or -1 if there isn't one.
     * @param {string} name 
     * @returns {number}
     */
    const find = name => {
        return names.get(name) ?? -1;
    };

    /**
     * Find the process by this name. If there isn't one, return a promise that
     * resolves when it appears.
     * @param {string} name 
     * @returns {number | Promise<number>}
     */
    const wait = name => {
        return names.get(name) ?? new Promise(resolve => {
            const previous = nameCallbacks.get(name);
            if (previous instanceof Array) previous.push(resolve);
            else nameCallbacks.set(name, [resolve]);
        });
    };

    // =================== Tree navigation =================

    /**
     * Return the children of a given process
     * @param {number} pid 
     * @returns {Set<number>}
     */
    const children = pid => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        return proc.children;
    }

    /**
     * Get the parent of the given process if it exists.
     * @param {number} pid 
     * @returns {number | undefined}
     */
    const parent = pid => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        return proc.parent;
    }

    return {
        // ==== API ====
        // Lifetimes
        start, fork, separate, exit,
        // Communicate
        send,
        // Visibility
        name, find, wait,
        // ==== Management ====
        // Tree
        children, parent
    };
}